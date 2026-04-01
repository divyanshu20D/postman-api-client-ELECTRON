import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { db } from '../../db/connection';
import { historyEntries } from '../../db/schema';
import type { ExecuteRequestInput } from '../../shared/ipc';
import type { BinaryBodyConfig, ExecutionResult, FormDataRow, KeyValueRow, RequestBodyType } from '../../shared/models';

type HeaderRow = KeyValueRow;

const DEFAULT_REQUEST_TIMEOUT_MS = 300_000;

interface ActiveExecution {
  controller: AbortController;
  timeoutHandle: NodeJS.Timeout;
  timedOut: boolean;
}

const activeExecutions = new Map<string, ActiveExecution>();

class RequestCancelledError extends Error {
  constructor() {
    super('Request cancelled');
    this.name = 'RequestCancelledError';
  }
}

class RequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    this.name = 'RequestTimeoutError';
  }
}

/**
 * Executes an HTTP request using Node.js fetch (no CORS restrictions).
 * Saves a history entry with request snapshot and response data.
 */
export async function executeRequest(input: ExecuteRequestInput): Promise<ExecutionResult> {
  const controller = new AbortController();
  const execution: ActiveExecution = {
    controller,
    timeoutHandle: setTimeout(() => {
      execution.timedOut = true;
      controller.abort();
    }, DEFAULT_REQUEST_TIMEOUT_MS),
    timedOut: false,
  };
  activeExecutions.set(input.executionId, execution);

  // Build headers
  const headerRows = parseJson<HeaderRow[]>(input.headers, []);
  const headers = new Headers();

  for (const row of headerRows) {
    if (row.enabled && row.key) {
      headers.set(row.key, row.value);
    }
  }

  // Apply auth
  if (input.authType === 'bearer' && input.authConfig) {
    headers.set('Authorization', `Bearer ${input.authConfig}`);
  } else if (input.authType === 'basic' && input.authConfig) {
    try {
      const creds = JSON.parse(input.authConfig) as { username?: string; password?: string };
      const encoded = Buffer.from(`${creds.username ?? ''}:${creds.password ?? ''}`).toString('base64');
      headers.set('Authorization', `Basic ${encoded}`);
    } catch {
      // Invalid JSON — skip
    }
  } else if (input.authType === 'apikey' && input.authConfig) {
    try {
      const config = JSON.parse(input.authConfig) as { key?: string; value?: string; addTo?: string };
      if (config.key && config.value) {
        headers.set(config.key, config.value);
      }
    } catch {
      // Invalid JSON — skip
    }
  }

  // Build URL with query params
  let finalUrl = input.url;
  const queryRows = parseJson<HeaderRow[]>(input.queryParams, []);
  const enabledParams = queryRows.filter((r) => r.enabled && r.key);
  if (enabledParams.length > 0) {
    try {
      const url = new URL(finalUrl);
      for (const row of enabledParams) {
        url.searchParams.set(row.key, row.value);
      }
      finalUrl = url.toString();
    } catch {
      // URL parse failed — use as-is
    }
  }

  // Build fetch options
  const fetchOptions: RequestInit = {
    method: input.method,
    headers,
    signal: controller.signal,
  };

  // Execute
  const startTime = performance.now();
  let result: ExecutionResult;

  try {
    if (!['GET', 'HEAD'].includes(input.method)) {
      await applyRequestBody(fetchOptions, headers, input);
    }

    const response = await fetch(finalUrl, fetchOptions);
    const bodyText = await response.text();
    const durationMs = Math.round(performance.now() - startTime);

    const responseHeaders: Array<{ key: string; value: string }> = [];
    response.headers.forEach((value, key) => {
      responseHeaders.push({ key, value });
    });

    result = {
      statusCode: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: bodyText,
      durationMs,
      sizeBytes: new TextEncoder().encode(bodyText).length,
    };
  } catch (err) {
    if (isAbortError(err)) {
      if (execution.timedOut) {
        throw new RequestTimeoutError(DEFAULT_REQUEST_TIMEOUT_MS);
      }
      throw new RequestCancelledError();
    }

    const durationMs = Math.round(performance.now() - startTime);
    const message = err instanceof Error ? err.message : String(err);

    result = {
      statusCode: 0,
      statusText: 'Network Error',
      headers: [],
      body: JSON.stringify({ error: message }, null, 2),
      durationMs,
      sizeBytes: 0,
    };
  } finally {
    clearTimeout(execution.timeoutHandle);
    activeExecutions.delete(input.executionId);
  }

  // Save history entry
  const timestamp = new Date().toISOString();
  db.insert(historyEntries)
    .values({
      id: randomUUID(),
      requestId: input.requestId ?? null,
      workspaceId: input.workspaceId,
      requestSnapshot: JSON.stringify({
        name: input.name,
        method: input.method,
        url: input.url,
        queryParams: input.queryParams,
        headers: input.headers,
        bodyType: input.bodyType,
        body: input.body,
        bodyMeta: input.bodyMeta,
        authType: input.authType,
        authConfig: input.authConfig,
      }),
      responseSnapshot: JSON.stringify({
        statusCode: result.statusCode,
        statusText: result.statusText,
        headers: result.headers,
        bodyPreview: result.body.slice(0, 2000),
        durationMs: result.durationMs,
        sizeBytes: result.sizeBytes,
      }),
      statusCode: result.statusCode,
      durationMs: result.durationMs,
      createdAt: timestamp,
    })
    .run();

  return result;
}

export function cancelRequestExecution(executionId: string): boolean {
  const execution = activeExecutions.get(executionId);
  if (!execution) {
    return false;
  }

  execution.controller.abort();
  return true;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeBodyType(bodyType: RequestBodyType | null | undefined, body: string | null | undefined): RequestBodyType {
  if (bodyType) {
    return bodyType;
  }

  return body ? 'raw' : 'none';
}

async function applyRequestBody(fetchOptions: RequestInit, headers: Headers, input: ExecuteRequestInput) {
  const bodyType = normalizeBodyType(input.bodyType, input.body);

  switch (bodyType) {
    case 'none':
      return;
    case 'raw':
      if (input.body) {
        fetchOptions.body = input.body;
      }
      return;
    case 'x-www-form-urlencoded': {
      const bodyRows = parseJson<KeyValueRow[]>(input.bodyMeta ?? '[]', []);
      const searchParams = new URLSearchParams();

      for (const row of bodyRows) {
        if (row.enabled && row.key) {
          searchParams.append(row.key, row.value);
        }
      }

      fetchOptions.body = searchParams.toString();
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8');
      }
      return;
    }
    case 'form-data': {
      const rows = parseJson<FormDataRow[]>(input.bodyMeta ?? '[]', []);
      const formData = new FormData();

      for (const row of rows) {
        if (!row.enabled || !row.key) {
          continue;
        }

        if (row.kind === 'file') {
          if (!row.filePath) {
            continue;
          }

          const fileBuffer = await readFile(row.filePath);
          const fileBlob = new Blob([fileBuffer], {
            type: row.contentType ?? 'application/octet-stream',
          });
          formData.append(row.key, fileBlob, row.fileName ?? 'upload.bin');
          continue;
        }

        formData.append(row.key, row.value);
      }

      headers.delete('content-type');
      fetchOptions.body = formData;
      return;
    }
    case 'binary': {
      const config = parseJson<BinaryBodyConfig | null>(input.bodyMeta ?? 'null', null);
      if (!config?.filePath) {
        return;
      }

      const fileBuffer = await readFile(config.filePath);
      fetchOptions.body = new Uint8Array(fileBuffer);
      if (config.contentType && !headers.has('content-type')) {
        headers.set('content-type', config.contentType);
      }
      return;
    }
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}
