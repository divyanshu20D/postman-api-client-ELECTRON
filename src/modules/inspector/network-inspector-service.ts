import { webContents } from 'electron';
import type { WebContents } from 'electron';
import type {
  HeaderRecord,
  InspectorRequestState,
  InspectorResourceType,
  NetworkInspectorEntry,
  NetworkInspectorEvent,
} from '../../shared/models';
import { logMainError, logMainInfo, logMainWarn } from '../../main/logger';

const DEBUGGER_PROTOCOL_VERSION = '1.3';
const INSPECTOR_EVENT_CHANNEL = 'inspector:event';

interface MutableInspectorEntry extends NetworkInspectorEntry {
  startedAtMs: number;
}

class NetworkInspectorService {
  private attachedContents: WebContents | null = null;

  private subscriberContents: WebContents | null = null;

  private entries = new Map<string, MutableInspectorEntry>();

  async attach(subscriber: WebContents, targetWebContentsId: number) {
    this.subscriberContents = subscriber;
    const targetContents = webContents.fromId(targetWebContentsId);

    if (!targetContents) {
      throw new Error('Unable to find the selected browser surface.');
    }

    if (this.attachedContents?.id === targetContents.id) {
      return;
    }

    await this.detach(false);

    this.attachedContents = targetContents;

    if (!targetContents.debugger.isAttached()) {
      targetContents.debugger.attach(DEBUGGER_PROTOCOL_VERSION);
    }

    targetContents.debugger.on('message', this.handleDebuggerMessage);
    targetContents.on('destroyed', this.handleTargetDestroyed);

    await targetContents.debugger.sendCommand('Network.enable', {
      maxPostDataSize: 1024 * 1024,
      maxResourceBufferSize: 1024 * 1024,
      maxTotalBufferSize: 8 * 1024 * 1024,
    });

    logMainInfo('Attached network inspector', {
      targetWebContentsId,
      subscriberWebContentsId: subscriber.id,
    });
  }

  async detach(emitReset = true) {
    if (this.attachedContents) {
      const targetContents = this.attachedContents;
      if (!targetContents.isDestroyed()) {
        targetContents.removeListener('destroyed', this.handleTargetDestroyed);
        targetContents.debugger.removeListener('message', this.handleDebuggerMessage);

        if (targetContents.debugger.isAttached()) {
          try {
            targetContents.debugger.detach();
          } catch (error) {
            logMainWarn('Failed to detach debugger from inspector target', error);
          }
        }
      }
    }

    this.attachedContents = null;

    if (emitReset) {
      this.subscriberContents = null;
    }
  }

  clear() {
    this.entries.clear();
    this.sendEvent({ type: 'reset' });
  }

  listEntries(): NetworkInspectorEntry[] {
    return Array.from(this.entries.values())
      .toSorted((left, right) => right.startedAt.localeCompare(left.startedAt))
      .map((entry) => serializeEntry(entry));
  }

  private handleTargetDestroyed = () => {
    void this.detach(false);
  };

  private handleDebuggerMessage = async (
    _event: unknown,
    method: string,
    params: Record<string, unknown>,
  ) => {
    try {
      switch (method) {
        case 'Network.requestWillBeSent':
          this.handleRequestWillBeSent(params as RequestWillBeSentPayload);
          break;
        case 'Network.requestWillBeSentExtraInfo':
          this.handleRequestWillBeSentExtraInfo(params as RequestExtraInfoPayload);
          break;
        case 'Network.responseReceived':
          this.handleResponseReceived(params as ResponseReceivedPayload);
          break;
        case 'Network.responseReceivedExtraInfo':
          this.handleResponseReceivedExtraInfo(params as ResponseExtraInfoPayload);
          break;
        case 'Network.loadingFinished':
          await this.handleLoadingFinished(params as LoadingFinishedPayload);
          break;
        case 'Network.loadingFailed':
          this.handleLoadingFailed(params as LoadingFailedPayload);
          break;
        default:
          break;
      }
    } catch (error) {
      logMainError('Unhandled network inspector debugger event', {
        method,
        error,
      });
    }
  };

  private handleRequestWillBeSent(payload: RequestWillBeSentPayload) {
    const startedAtMs = payload.wallTime
      ? Math.round(payload.wallTime * 1000)
      : Date.now();

    const entry: MutableInspectorEntry = {
      id: payload.requestId,
      url: payload.request.url,
      method: payload.request.method,
      resourceType: normalizeResourceType(payload.type, payload.request),
      state: 'pending',
      statusCode: null,
      statusText: null,
      requestHeaders: normalizeHeaders(payload.request.headers),
      responseHeaders: [],
      requestBody: payload.request.postData ?? null,
      responseBody: null,
      errorText: null,
      startedAt: new Date(startedAtMs).toISOString(),
      startedAtMs,
      durationMs: null,
      responseSizeBytes: null,
      mimeType: null,
    };

    this.entries.set(payload.requestId, entry);
    this.pushEntry(entry);
  }

  private handleRequestWillBeSentExtraInfo(payload: RequestExtraInfoPayload) {
    const entry = this.entries.get(payload.requestId);
    if (!entry) {
      return;
    }

    entry.requestHeaders = normalizeHeaders(payload.headers);
    this.pushEntry(entry);
  }

  private handleResponseReceived(payload: ResponseReceivedPayload) {
    const entry = this.entries.get(payload.requestId);
    if (!entry) {
      return;
    }

    entry.resourceType = promoteResourceType(
      entry.resourceType,
      normalizeResourceType(payload.type, undefined, payload.response),
      entry,
      payload.response,
    );
    entry.statusCode = payload.response.status;
    entry.statusText = payload.response.statusText;
    entry.responseHeaders = normalizeHeaders(payload.response.headers);
    entry.mimeType = payload.response.mimeType ?? null;
    entry.state = resolveStateFromStatus(payload.response.status);
    this.pushEntry(entry);
  }

  private handleResponseReceivedExtraInfo(payload: ResponseExtraInfoPayload) {
    const entry = this.entries.get(payload.requestId);
    if (!entry) {
      return;
    }

    entry.responseHeaders = normalizeHeaders(payload.headers);
    entry.statusCode = payload.statusCode;
    entry.state = resolveStateFromStatus(payload.statusCode);
    this.pushEntry(entry);
  }

  private async handleLoadingFinished(payload: LoadingFinishedPayload) {
    const entry = this.entries.get(payload.requestId);
    if (!entry) {
      return;
    }

    entry.durationMs = Math.max(0, Date.now() - entry.startedAtMs);
    entry.responseSizeBytes = typeof payload.encodedDataLength === 'number'
      ? Math.max(0, Math.round(payload.encodedDataLength))
      : null;
    entry.state = entry.state === 'failed' ? 'failed' : 'success';

    const debuggerSession = this.attachedContents?.debugger;
    if (debuggerSession?.isAttached()) {
      try {
        const bodyResult = await debuggerSession.sendCommand('Network.getResponseBody', {
          requestId: payload.requestId,
        }) as { body: string; base64Encoded: boolean };

        entry.responseBody = bodyResult.base64Encoded
          ? '[Binary response body omitted]'
          : bodyResult.body;
      } catch (error) {
        entry.responseBody = null;
        logMainWarn('Failed to fetch response body for inspector entry', {
          requestId: payload.requestId,
          error,
        });
      }
    }

    this.pushEntry(entry);
  }

  private handleLoadingFailed(payload: LoadingFailedPayload) {
    const entry = this.entries.get(payload.requestId);
    if (!entry) {
      return;
    }

    entry.durationMs = Math.max(0, Date.now() - entry.startedAtMs);
    entry.errorText = payload.errorText ?? 'Request failed';
    entry.state = 'failed';
    this.pushEntry(entry);
  }

  private pushEntry(entry: MutableInspectorEntry) {
    this.sendEvent({
      type: 'upsert',
      entry: serializeEntry(entry),
    });
  }

  private sendEvent(event: NetworkInspectorEvent) {
    if (!this.subscriberContents || this.subscriberContents.isDestroyed()) {
      return;
    }

    this.subscriberContents.send(INSPECTOR_EVENT_CHANNEL, event);
  }
}

function serializeEntry(entry: MutableInspectorEntry): NetworkInspectorEntry {
  const { startedAtMs: _ignored, ...serializableEntry } = entry;
  return serializableEntry;
}

function normalizeHeaders(rawHeaders: Record<string, unknown> | undefined): HeaderRecord[] {
  if (!rawHeaders) {
    return [];
  }

  return Object.entries(rawHeaders).map(([key, value]) => ({
    key,
    value: Array.isArray(value) ? value.join(', ') : String(value),
  }));
}

function normalizeResourceType(
  type: string | undefined,
  request?: RequestDescriptor,
  response?: ResponseDescriptor,
): InspectorResourceType {
  switch ((type ?? '').toLowerCase()) {
    case 'xhr':
      return 'xhr';
    case 'fetch':
      return 'fetch';
    case 'preflight':
      return 'fetch';
    case 'document':
      return 'document';
    case 'stylesheet':
      return 'stylesheet';
    case 'script':
      return 'script';
    case 'image':
      return 'image';
    case 'media':
      return 'media';
    case 'font':
      return 'font';
    case 'websocket':
      return 'websocket';
    default:
      return inferApiResourceType(request, response);
  }
}

function promoteResourceType(
  currentType: InspectorResourceType,
  nextType: InspectorResourceType,
  entry: MutableInspectorEntry,
  response?: ResponseDescriptor,
): InspectorResourceType {
  if (nextType !== 'other') {
    return nextType;
  }

  if (currentType !== 'other') {
    return currentType;
  }

  return inferApiResourceType(
    {
      url: entry.url,
      method: entry.method,
      headers: headerRecordsToObject(entry.requestHeaders),
      postData: entry.requestBody ?? undefined,
    },
    response,
  );
}

function inferApiResourceType(
  request?: RequestDescriptor,
  response?: ResponseDescriptor,
): InspectorResourceType {
  if (!request) {
    return isLikelyApiResponse(response) ? 'fetch' : 'other';
  }

  const method = request.method.toUpperCase();
  const url = request.url.toLowerCase();
  const requestHeaders = normalizeHeaderLookup(request.headers);
  const contentType = requestHeaders['content-type'] ?? '';
  const accept = requestHeaders.accept ?? '';

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return 'fetch';
  }

  if (request.postData) {
    return 'fetch';
  }

  if (
    url.includes('/api/')
    || url.includes('/graphql')
    || accept.includes('application/json')
    || accept.includes('application/graphql-response+json')
    || contentType.includes('application/json')
    || contentType.includes('application/graphql')
    || isLikelyApiResponse(response)
  ) {
    return 'fetch';
  }

  return 'other';
}

function normalizeHeaderLookup(headers: Record<string, unknown> | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key.toLowerCase(),
      Array.isArray(value) ? value.join(', ') : String(value),
    ]),
  );
}

function headerRecordsToObject(headers: HeaderRecord[]): Record<string, string> {
  return Object.fromEntries(headers.map((header) => [header.key, header.value]));
}

function isLikelyApiResponse(response: ResponseDescriptor | undefined): boolean {
  const mimeType = (response?.mimeType ?? '').toLowerCase();
  return mimeType.includes('json') || mimeType.includes('graphql') || mimeType.includes('xml');
}

function resolveStateFromStatus(statusCode: number | null | undefined): InspectorRequestState {
  if (!statusCode) {
    return 'pending';
  }

  return statusCode >= 400 ? 'failed' : 'success';
}

interface RequestDescriptor {
  url: string;
  method: string;
  headers?: Record<string, unknown>;
  postData?: string;
}

interface RequestWillBeSentPayload {
  requestId: string;
  request: RequestDescriptor;
  type?: string;
  wallTime?: number;
}

interface RequestExtraInfoPayload {
  requestId: string;
  headers: Record<string, unknown>;
}

interface ResponseDescriptor {
  status: number;
  statusText: string;
  headers?: Record<string, unknown>;
  mimeType?: string;
}

interface ResponseReceivedPayload {
  requestId: string;
  type?: string;
  response: ResponseDescriptor;
}

interface ResponseExtraInfoPayload {
  requestId: string;
  headers: Record<string, unknown>;
  statusCode: number;
}

interface LoadingFinishedPayload {
  requestId: string;
  encodedDataLength?: number;
}

interface LoadingFailedPayload {
  requestId: string;
  errorText?: string;
}

export const networkInspectorService = new NetworkInspectorService();
