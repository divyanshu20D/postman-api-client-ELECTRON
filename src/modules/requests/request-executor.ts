import { randomUUID } from 'node:crypto';
import { db } from '../../db/connection';
import { historyEntries } from '../../db/schema';
import type { ExecuteRequestInput } from '../../shared/ipc';
import type { ExecutionResult } from '../../shared/models';

interface HeaderRow {
  key: string;
  value: string;
  enabled: boolean;
}

/**
 * Executes an HTTP request using Node.js fetch (no CORS restrictions).
 * Saves a history entry with request snapshot and response data.
 */
export async function executeRequest(input: ExecuteRequestInput): Promise<ExecutionResult> {
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
  };

  if (input.body && !['GET', 'HEAD'].includes(input.method)) {
    fetchOptions.body = input.body;
  }

  // Execute
  const startTime = performance.now();
  let result: ExecutionResult;

  try {
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
        body: input.body,
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

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
