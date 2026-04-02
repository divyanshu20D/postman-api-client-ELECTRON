import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/connection';
import { appSettings, collections, requests } from '../../db/schema';
import { createCollection } from './collection-service';
import { saveRequestDraft } from '../requests/request-service';
import type { BinaryBodyConfig, FormDataRow, KeyValueRow, RequestRecord } from '../../shared/models';
import type { ExportCollectionResult, ImportCollectionResult } from '../../shared/ipc';

const DEFAULT_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';
const POSTMAN_COLLECTION_SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';
const NATIVE_COLLECTION_FORMAT = 'reqkit-collection';
const NATIVE_COLLECTION_VERSION = 1;

interface PostmanCollection {
  info?: {
    name?: string;
    schema?: string;
    _postman_id?: string;
  };
  item?: PostmanItem[];
}

interface PostmanItem {
  name?: string;
  item?: PostmanItem[];
  request?: {
    method?: string;
    header?: Array<{ key?: string; value?: string; disabled?: boolean }>;
    auth?: {
      type?: string;
      bearer?: Array<{ key?: string; value?: string }>;
      basic?: Array<{ key?: string; value?: string }>;
      apikey?: Array<{ key?: string; value?: string }>;
    };
    body?: {
      mode?: string;
      raw?: string;
      urlencoded?: Array<{ key?: string; value?: string; disabled?: boolean }>;
      formdata?: Array<{
        key?: string;
        value?: string;
        type?: string;
        src?: string | string[];
        contentType?: string;
        disabled?: boolean;
      }>;
      file?: { src?: string | string[] };
    };
    url?:
      | string
      | {
          raw?: string;
          protocol?: string;
          host?: string[];
          path?: string[];
          query?: Array<{ key?: string; value?: string; disabled?: boolean }>;
        };
  };
}

interface NativeExportedFolder {
  id: string;
  parentId: string;
  name: string;
  sortOrder: number;
}

interface NativeExportedRequest {
  id: string;
  folderId: string | null;
  name: string;
  method: RequestRecord['method'];
  url: string;
  queryParams: string;
  headers: string;
  bodyType: RequestRecord['bodyType'];
  body: string | null;
  bodyMeta: string | null;
  authType: string | null;
  authConfig: string | null;
  createdAt: string;
  updatedAt: string;
}

interface NativeCollectionTransferFile {
  format: typeof NATIVE_COLLECTION_FORMAT;
  version: typeof NATIVE_COLLECTION_VERSION;
  exportedAt: string;
  app: {
    name: 'ReqKit';
  };
  collection: {
    id: string;
    name: string;
  };
  folders: NativeExportedFolder[];
  requests: NativeExportedRequest[];
}

const nativeCollectionTransferSchema: z.ZodType<NativeCollectionTransferFile> = z.object({
  format: z.literal(NATIVE_COLLECTION_FORMAT),
  version: z.literal(NATIVE_COLLECTION_VERSION),
  exportedAt: z.string(),
  app: z.object({
    name: z.literal('ReqKit'),
  }),
  collection: z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
  }),
  folders: z.array(
    z.object({
      id: z.string().uuid(),
      parentId: z.string().uuid(),
      name: z.string().min(1),
      sortOrder: z.number().int(),
    }),
  ),
  requests: z.array(
    z.object({
      id: z.string().uuid(),
      folderId: z.string().uuid().nullable(),
      name: z.string().min(1),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
      url: z.string(),
      queryParams: z.string(),
      headers: z.string(),
      bodyType: z.enum(['none', 'raw', 'form-data', 'x-www-form-urlencoded', 'binary']).nullable(),
      body: z.string().nullable(),
      bodyMeta: z.string().nullable(),
      authType: z.string().nullable(),
      authConfig: z.string().nullable(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
});

function getActiveWorkspaceId() {
  const settings = db.select().from(appSettings).where(eq(appSettings.id, DEFAULT_SETTINGS_ID)).get();
  if (!settings?.activeWorkspaceId) {
    throw new Error('No active workspace found.');
  }

  return settings.activeWorkspaceId;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try {
    return JSON.parse(value ?? 'null') as T;
  } catch {
    return fallback;
  }
}

function now() {
  return new Date().toISOString();
}

function sanitizeFileName(name: string) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').trim() || 'collection';
}

function getDescendantFolders(allCollections: Array<(typeof collections.$inferSelect)>, parentId: string): Array<(typeof collections.$inferSelect)> {
  const directChildren = allCollections
    .filter((item) => item.kind === 'folder' && item.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const descendants: Array<(typeof collections.$inferSelect)> = [];
  for (const child of directChildren) {
    descendants.push(child);
    descendants.push(...getDescendantFolders(allCollections, child.id));
  }

  return descendants;
}

function toNativeRequestExport(request: RequestRecord): NativeExportedRequest {
  return {
    id: request.id,
    folderId: request.folderId,
    name: request.name,
    method: request.method,
    url: request.url,
    queryParams: request.queryParams,
    headers: request.headers,
    bodyType: request.bodyType,
    body: request.body,
    bodyMeta: request.bodyMeta,
    authType: request.authType,
    authConfig: request.authConfig,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

async function fileExists(filePath: string | null | undefined) {
  if (!filePath) {
    return false;
  }

  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function countMissingFileReferences(exportedRequests: NativeExportedRequest[]) {
  let missingFileCount = 0;

  for (const request of exportedRequests) {
    if (request.bodyType === 'binary') {
      const binary = parseJson<BinaryBodyConfig | null>(request.bodyMeta, null);
      if (binary?.filePath && !(await fileExists(binary.filePath))) {
        missingFileCount += 1;
      }
      continue;
    }

    if (request.bodyType === 'form-data') {
      const rows = parseJson<FormDataRow[]>(request.bodyMeta, []);
      for (const row of rows) {
        if (row.kind === 'file' && row.filePath && !(await fileExists(row.filePath))) {
          missingFileCount += 1;
        }
      }
    }
  }

  return missingFileCount;
}

function quotePathSegments(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    return {
      raw: rawUrl,
      protocol: parsed.protocol.replace(':', ''),
      host: parsed.hostname.split('.'),
      path: parsed.pathname.split('/').filter(Boolean),
      query: Array.from(parsed.searchParams.entries()).map(([key, value]) => ({
        key,
        value,
      })),
    };
  } catch {
    return { raw: rawUrl };
  }
}

function buildPostmanAuth(request: RequestRecord) {
  if (request.authType === 'bearer' && request.authConfig) {
    return {
      type: 'bearer',
      bearer: [{ key: 'token', value: request.authConfig }],
    };
  }

  if (request.authType === 'basic' && request.authConfig) {
    try {
      const parsed = JSON.parse(request.authConfig) as { username?: string; password?: string };
      return {
        type: 'basic',
        basic: [
          { key: 'username', value: parsed.username ?? '' },
          { key: 'password', value: parsed.password ?? '' },
        ],
      };
    } catch {
      return undefined;
    }
  }

  if (request.authType === 'apikey' && request.authConfig) {
    try {
      const parsed = JSON.parse(request.authConfig) as { key?: string; value?: string; addTo?: string };
      return {
        type: 'apikey',
        apikey: [
          { key: 'key', value: parsed.key ?? '' },
          { key: 'value', value: parsed.value ?? '' },
          { key: 'in', value: parsed.addTo === 'query' ? 'query' : 'header' },
        ],
      };
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function buildPostmanBody(request: RequestRecord) {
  switch (request.bodyType ?? 'none') {
    case 'raw':
      return request.body
        ? {
            mode: 'raw',
            raw: request.body,
          }
        : undefined;
    case 'x-www-form-urlencoded': {
      const rows = parseJson<KeyValueRow[]>(request.bodyMeta, []);
      return {
        mode: 'urlencoded',
        urlencoded: rows.map((row) => ({
          key: row.key,
          value: row.value,
          disabled: !row.enabled,
        })),
      };
    }
    case 'form-data': {
      const rows = parseJson<FormDataRow[]>(request.bodyMeta, []);
      return {
        mode: 'formdata',
        formdata: rows.map((row) => ({
          key: row.key,
          value: row.kind === 'text' ? row.value : undefined,
          type: row.kind === 'file' ? 'file' : 'text',
          src: row.kind === 'file' ? row.filePath ?? undefined : undefined,
          contentType: row.kind === 'file' ? row.contentType ?? undefined : undefined,
          disabled: !row.enabled,
        })),
      };
    }
    case 'binary': {
      const binary = parseJson<BinaryBodyConfig | null>(request.bodyMeta, null);
      return {
        mode: 'file',
        file: {
          src: binary?.filePath ?? undefined,
        },
      };
    }
    case 'none':
    default:
      return undefined;
  }
}

function buildPostmanRequest(request: RequestRecord): PostmanItem {
  const headers = parseJson<KeyValueRow[]>(request.headers, []).map((row) => ({
    key: row.key,
    value: row.value,
    disabled: !row.enabled,
  }));

  return {
    name: request.name,
    request: {
      method: request.method,
      header: headers,
      auth: buildPostmanAuth(request),
      body: buildPostmanBody(request),
      url: quotePathSegments(request.url),
    },
  };
}

export async function exportReqKitCollectionToFile(
  collectionId: string,
  filePath?: string | null,
): Promise<ExportCollectionResult> {
  const collection = db.select().from(collections).where(eq(collections.id, collectionId)).get();
  if (!collection || collection.kind !== 'collection') {
    throw new Error('Collection not found.');
  }

  const workspaceCollections = db
    .select()
    .from(collections)
    .where(eq(collections.workspaceId, collection.workspaceId))
    .all();
  const descendantFolders = getDescendantFolders(workspaceCollections, collection.id);
  const collectionRequests = db
    .select()
    .from(requests)
    .where(eq(requests.collectionId, collectionId))
    .all()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const payload: NativeCollectionTransferFile = {
    format: NATIVE_COLLECTION_FORMAT,
    version: NATIVE_COLLECTION_VERSION,
    exportedAt: now(),
    app: {
      name: 'ReqKit',
    },
    collection: {
      id: collection.id,
      name: collection.name,
    },
    folders: descendantFolders.map((folder) => ({
      id: folder.id,
      parentId: folder.parentId!,
      name: folder.name,
      sortOrder: folder.sortOrder,
    })),
    requests: collectionRequests.map(toNativeRequestExport),
  };

  const targetPath = filePath ?? `${sanitizeFileName(collection.name)}.reqkit_collection.json`;
  await writeFile(targetPath, JSON.stringify(payload, null, 2), 'utf8');

  return {
    filePath: targetPath,
    collectionName: collection.name,
    folderCount: payload.folders.length,
    requestCount: payload.requests.length,
  };
}

export async function exportCollectionToFile(collectionId: string, filePath?: string | null) {
  const collection = db.select().from(collections).where(eq(collections.id, collectionId)).get();
  if (!collection) {
    throw new Error('Collection not found.');
  }

  const collectionRequests = db
    .select()
    .from(requests)
    .where(eq(requests.collectionId, collectionId))
    .all()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const payload: PostmanCollection = {
    info: {
      name: collection.name,
      schema: POSTMAN_COLLECTION_SCHEMA,
      _postman_id: randomUUID(),
    },
    item: collectionRequests.map(buildPostmanRequest),
  };

  const targetPath = filePath ?? `${sanitizeFileName(collection.name)}.postman_collection.json`;
  await writeFile(targetPath, JSON.stringify(payload, null, 2), 'utf8');
  return targetPath;
}

function buildUrlFromPostman(url: PostmanItem['request']['url']) {
  if (!url) {
    return '';
  }

  if (typeof url === 'string') {
    return url;
  }

  if (url.raw) {
    return url.raw;
  }

  const protocol = url.protocol ? `${url.protocol}://` : '';
  const host = url.host?.join('.') ?? '';
  const pathname = url.path?.length ? `/${url.path.join('/')}` : '';
  const queryString = url.query?.length
    ? `?${url.query
        .filter((item) => item.key)
        .map((item) => `${encodeURIComponent(item.key ?? '')}=${encodeURIComponent(item.value ?? '')}`)
        .join('&')}`
    : '';

  return `${protocol}${host}${pathname}${queryString}`;
}

function serializeQueryParams(rows: Array<{ key: string; value: string; enabled: boolean }>) {
  return JSON.stringify(rows, null, 2);
}

function splitUrlAndQueryParams(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const queryParams = Array.from(parsed.searchParams.entries()).map(([key, value]) => ({
      key,
      value,
      enabled: true,
    }));
    parsed.search = '';
    return {
      url: parsed.toString(),
      queryParams: serializeQueryParams(queryParams),
    };
  } catch {
    return {
      url: rawUrl,
      queryParams: '[]',
    };
  }
}

function buildUrlDraftFromPostman(url: PostmanItem['request']['url']) {
  if (!url) {
    return {
      url: '',
      queryParams: '[]',
    };
  }

  if (typeof url === 'string') {
    return splitUrlAndQueryParams(url);
  }

  if (url.query?.length) {
    const protocol = url.protocol ? `${url.protocol}://` : '';
    const host = url.host?.join('.') ?? '';
    const pathname = url.path?.length ? `/${url.path.join('/')}` : '';
    const baseUrl = url.raw
      ? splitUrlAndQueryParams(url.raw).url
      : `${protocol}${host}${pathname}`;

    return {
      url: baseUrl,
      queryParams: serializeQueryParams(
        url.query
          .filter((item) => item.key)
          .map((item) => ({
            key: item.key ?? '',
            value: item.value ?? '',
            enabled: !item.disabled,
          })),
      ),
    };
  }

  const rawUrl = buildUrlFromPostman(url);
  return splitUrlAndQueryParams(rawUrl);
}

function normalizePostmanAuthEntries(
  entries: unknown,
): Array<{ key?: string; value?: string }> {
  if (Array.isArray(entries)) {
    return entries
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => {
        const candidate = entry as { key?: unknown; value?: unknown };
        return {
          key: typeof candidate.key === 'string' ? candidate.key : undefined,
          value: typeof candidate.value === 'string' ? candidate.value : undefined,
        };
      });
  }

  if (entries && typeof entries === 'object') {
    return Object.entries(entries as Record<string, unknown>).map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : value == null ? undefined : String(value),
    }));
  }

  return [];
}

function parsePostmanAuth(item: NonNullable<PostmanItem['request']>['auth']) {
  if (!item?.type) {
    return { authType: null, authConfig: null };
  }

  if (item.type === 'bearer') {
    const bearerEntries = normalizePostmanAuthEntries((item as { bearer?: unknown }).bearer);
    const token = bearerEntries.find((entry) => entry.key === 'token')?.value ?? null;
    return { authType: token ? 'bearer' : null, authConfig: token };
  }

  if (item.type === 'basic') {
    const basicEntries = normalizePostmanAuthEntries((item as { basic?: unknown }).basic);
    const username = basicEntries.find((entry) => entry.key === 'username')?.value ?? '';
    const password = basicEntries.find((entry) => entry.key === 'password')?.value ?? '';
    return {
      authType: 'basic',
      authConfig: JSON.stringify({ username, password }),
    };
  }

  if (item.type === 'apikey') {
    const apiKeyEntries = normalizePostmanAuthEntries((item as { apikey?: unknown }).apikey);
    const key = apiKeyEntries.find((entry) => entry.key === 'key')?.value ?? '';
    const value = apiKeyEntries.find((entry) => entry.key === 'value')?.value ?? '';
    const addTo = apiKeyEntries.find((entry) => entry.key === 'in')?.value ?? 'header';
    return {
      authType: 'apikey',
      authConfig: JSON.stringify({ key, value, addTo }),
    };
  }

  return { authType: null, authConfig: null };
}

function mapImportedBody(body: NonNullable<PostmanItem['request']>['body']) {
  if (!body?.mode) {
    return {
      bodyType: 'none' as const,
      body: null,
      bodyMeta: null,
    };
  }

  if (body.mode === 'raw') {
    return {
      bodyType: 'raw' as const,
      body: body.raw ?? null,
      bodyMeta: null,
    };
  }

  if (body.mode === 'urlencoded') {
    return {
      bodyType: 'x-www-form-urlencoded' as const,
      body: null,
      bodyMeta: JSON.stringify(
        (body.urlencoded ?? []).map((row) => ({
          key: row.key ?? '',
          value: row.value ?? '',
          enabled: !row.disabled,
        })),
        null,
        2,
      ),
    };
  }

  if (body.mode === 'formdata') {
    return {
      bodyType: 'form-data' as const,
      body: null,
      bodyMeta: JSON.stringify(
        (body.formdata ?? []).map((row) => {
          const src = Array.isArray(row.src) ? row.src[0] ?? null : row.src ?? null;
          return {
            key: row.key ?? '',
            value: row.type === 'file' ? '' : row.value ?? '',
            enabled: !row.disabled,
            kind: row.type === 'file' ? 'file' : 'text',
            filePath: row.type === 'file' ? src : null,
            fileName: row.type === 'file' && src ? path.basename(src) : null,
            contentType: row.type === 'file' ? row.contentType ?? null : null,
          } satisfies FormDataRow;
        }),
        null,
        2,
      ),
    };
  }

  if (body.mode === 'file') {
    const src = Array.isArray(body.file?.src) ? body.file?.src[0] ?? null : body.file?.src ?? null;
    return {
      bodyType: 'binary' as const,
      body: null,
      bodyMeta: JSON.stringify(
        {
          filePath: src,
          fileName: src ? path.basename(src) : null,
          contentType: null,
        } satisfies BinaryBodyConfig,
        null,
        2,
      ),
    };
  }

  return {
    bodyType: 'none' as const,
    body: null,
    bodyMeta: null,
  };
}

async function importReqKitCollectionFromParsed(
  workspaceId: string,
  parsed: NativeCollectionTransferFile,
): Promise<ImportCollectionResult> {
  const createdCollection = createCollection({
    workspaceId,
    name: parsed.collection.name,
    kind: 'collection',
  });

  const idMap = new Map<string, string>([[parsed.collection.id, createdCollection.id]]);

  for (const folder of parsed.folders) {
    const mappedParentId = idMap.get(folder.parentId);
    if (!mappedParentId) {
      throw new Error(`Folder "${folder.name}" references a missing parent.`);
    }

    const createdFolder = createCollection({
      workspaceId,
      parentId: mappedParentId,
      name: folder.name,
      kind: 'folder',
    });
    idMap.set(folder.id, createdFolder.id);
  }

  for (const request of parsed.requests) {
    const mappedFolderId = request.folderId ? idMap.get(request.folderId) ?? null : null;
    if (request.folderId && !mappedFolderId) {
      throw new Error(`Request "${request.name}" references a missing folder.`);
    }

    saveRequestDraft({
      workspaceId,
      collectionId: createdCollection.id,
      folderId: mappedFolderId,
      name: request.name,
      method: request.method,
      url: request.url,
      queryParams: request.queryParams,
      headers: request.headers,
      bodyType: request.bodyType,
      body: request.body,
      bodyMeta: request.bodyMeta,
      authType: request.authType,
      authConfig: request.authConfig,
    });
  }

  const missingFileCount = await countMissingFileReferences(parsed.requests);

  return {
    collectionId: createdCollection.id,
    collectionName: createdCollection.name,
    folderCount: parsed.folders.length,
    requestCount: parsed.requests.length,
    missingFileCount,
  };
}

export async function importReqKitCollectionFromFile(filePath: string): Promise<ImportCollectionResult> {
  const workspaceId = getActiveWorkspaceId();
  const raw = await readFile(filePath, 'utf8');
  const parsed = nativeCollectionTransferSchema.parse(JSON.parse(raw));
  return importReqKitCollectionFromParsed(workspaceId, parsed);
}

async function importPostmanItems(
  workspaceId: string,
  collectionId: string,
  items: PostmanItem[],
  importedRequests: NativeExportedRequest[],
  parentFolderId: string | null = null,
): Promise<{ folderCount: number; requestCount: number }> {
  let folderCount = 0;
  let requestCount = 0;

  for (const item of items) {
    if (item.item?.length) {
      const createdFolder = createCollection({
        workspaceId,
        parentId: parentFolderId ?? collectionId,
        name: item.name?.trim() || 'Folder',
        kind: 'folder',
      });

      folderCount += 1;

      const nestedCounts = await importPostmanItems(
        workspaceId,
        collectionId,
        item.item,
        importedRequests,
        createdFolder.id,
      );

      folderCount += nestedCounts.folderCount;
      requestCount += nestedCounts.requestCount;
      continue;
    }

    if (!item.request) {
      continue;
    }

    const headers = (item.request.header ?? []).map((header) => ({
      key: header.key ?? '',
      value: header.value ?? '',
      enabled: !header.disabled,
    }));
    const { authType, authConfig } = parsePostmanAuth(item.request.auth);
    const { bodyType, body, bodyMeta } = mapImportedBody(item.request.body);
    const { url, queryParams } = buildUrlDraftFromPostman(item.request.url);

    saveRequestDraft({
      workspaceId,
      collectionId,
      folderId: parentFolderId,
      name: item.name?.trim() || 'Imported Request',
      method: ((item.request.method ?? 'GET').toUpperCase()) as RequestRecord['method'],
      url,
      queryParams,
      headers: JSON.stringify(headers, null, 2),
      bodyType,
      body,
      bodyMeta,
      authType,
      authConfig,
    });

    importedRequests.push({
      id: randomUUID(),
      folderId: parentFolderId,
      name: item.name?.trim() || 'Imported Request',
      method: ((item.request.method ?? 'GET').toUpperCase()) as RequestRecord['method'],
      url,
      queryParams,
      headers: JSON.stringify(headers, null, 2),
      bodyType,
      body,
      bodyMeta,
      authType,
      authConfig,
      createdAt: now(),
      updatedAt: now(),
    });
    requestCount += 1;
  }

  return { folderCount, requestCount };
}

async function importPostmanCollectionFromParsed(
  workspaceId: string,
  filePath: string,
  parsed: PostmanCollection,
): Promise<ImportCollectionResult> {
  const collectionName = parsed.info?.name?.trim() || path.basename(filePath, path.extname(filePath));
  const createdCollection = createCollection({
    workspaceId,
    name: collectionName,
    kind: 'collection',
  });
  const importedRequests: NativeExportedRequest[] = [];
  const { folderCount, requestCount } = await importPostmanItems(
    workspaceId,
    createdCollection.id,
    parsed.item ?? [],
    importedRequests,
  );
  const missingFileCount = await countMissingFileReferences(importedRequests);

  return {
    collectionId: createdCollection.id,
    collectionName: createdCollection.name,
    folderCount,
    requestCount,
    missingFileCount,
  };
}

function isPostmanCollection(value: unknown): value is PostmanCollection {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as PostmanCollection;
  return Array.isArray(candidate.item);
}

export async function importCollectionFromFile(filePath: string): Promise<ImportCollectionResult> {
  const workspaceId = getActiveWorkspaceId();
  const raw = await readFile(filePath, 'utf8');
  const parsedJson = JSON.parse(raw) as unknown;
  const nativeCollection = nativeCollectionTransferSchema.safeParse(parsedJson);

  if (nativeCollection.success) {
    return importReqKitCollectionFromParsed(workspaceId, nativeCollection.data);
  }

  if (isPostmanCollection(parsedJson)) {
    return importPostmanCollectionFromParsed(workspaceId, filePath, parsedJson);
  }

  throw new Error('Unsupported collection file. Please choose a ReqKit or Postman collection JSON file.');
}
