import type { HttpMethod } from '@shared/models';

export interface ParsedCurl {
  method: HttpMethod;
  url: string;
  headers: Array<{ key: string; value: string; enabled: boolean }>;
  body: string | null;
  authType: string | null;
  authConfig: string | null;
}

/**
 * Parses a cURL command string into structured request data.
 * Handles: -X, -H, -d, --data, --data-raw, --data-binary, -u, -b, URL
 */
export function parseCurl(raw: string): ParsedCurl {
  // Normalize: remove line continuations, collapse whitespace
  const cleaned = raw
    .replace(/\\\r?\n/g, ' ')  // backslash-newlines
    .replace(/\r?\n/g, ' ')
    .trim();

  // Remove leading "curl" if present
  const noCurl = cleaned.replace(/^curl\s+/i, '');

  const tokens = tokenize(noCurl);

  let method: HttpMethod = 'GET';
  let url = '';
  const headers: ParsedCurl['headers'] = [];
  let body: string | null = null;
  let authType: string | null = null;
  let authConfig: string | null = null;

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token === '-X' || token === '--request') {
      i++;
      const m = (tokens[i] ?? 'GET').toUpperCase();
      if (isValidMethod(m)) method = m;
    } else if (token === '-H' || token === '--header') {
      i++;
      const headerStr = tokens[i] ?? '';
      const colonIndex = headerStr.indexOf(':');
      if (colonIndex > 0) {
        const key = headerStr.slice(0, colonIndex).trim();
        const value = headerStr.slice(colonIndex + 1).trim();
        headers.push({ key, value, enabled: true });
      }
    } else if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary' || token === '--data-urlencode') {
      i++;
      body = tokens[i] ?? '';
      if (method === 'GET') method = 'POST'; // cURL defaults to POST with -d
    } else if (token === '-u' || token === '--user') {
      i++;
      const userPass = tokens[i] ?? '';
      const [username, ...rest] = userPass.split(':');
      authType = 'basic';
      authConfig = JSON.stringify({ username, password: rest.join(':') });
    } else if (token === '-b' || token === '--cookie') {
      i++;
      headers.push({ key: 'Cookie', value: tokens[i] ?? '', enabled: true });
    } else if (token === '-A' || token === '--user-agent') {
      i++;
      headers.push({ key: 'User-Agent', value: tokens[i] ?? '', enabled: true });
    } else if (token === '--compressed' || token === '-s' || token === '-S' || token === '-k' || token === '--insecure' || token === '-L' || token === '--location' || token === '-v' || token === '--verbose') {
      // Skip flags that don't take a value
    } else if (token.startsWith('-')) {
      // Unknown flag with possible value — skip it and its value
      i++;
    } else {
      // Bare token = URL
      url = token.replace(/^['"]|['"]$/g, '');
    }

    i++;
  }

  // Check for Bearer token in headers
  if (!authType) {
    const authHeader = headers.find((h) => h.key.toLowerCase() === 'authorization');
    if (authHeader) {
      const val = authHeader.value;
      if (val.toLowerCase().startsWith('bearer ')) {
        authType = 'bearer';
        authConfig = val.slice(7).trim();
        // Remove from headers since it's now in auth config
        const idx = headers.indexOf(authHeader);
        headers.splice(idx, 1);
      }
    }
  }

  return { method, url, headers, body, authType, authConfig };
}

/** Tokenize respecting quotes */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escape = false;

  for (const ch of input) {
    if (escape) {
      current += ch;
      escape = false;
      continue;
    }

    if (ch === '\\' && !inSingle) {
      escape = true;
      continue;
    }

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if (ch === ' ' && !inSingle && !inDouble) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (current) tokens.push(current);
  return tokens;
}

function isValidMethod(m: string): m is HttpMethod {
  return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(m);
}
