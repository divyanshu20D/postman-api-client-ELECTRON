export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS';

export type RequestBodyType = 'none' | 'raw' | 'form-data' | 'x-www-form-urlencoded' | 'binary';

export interface KeyValueRow {
  key: string;
  value: string;
  enabled: boolean;
}

export interface FormDataRow extends KeyValueRow {
  kind: 'text' | 'file';
  filePath: string | null;
  fileName: string | null;
  contentType: string | null;
}

export interface BinaryBodyConfig {
  filePath: string | null;
  fileName: string | null;
  contentType: string | null;
}

export interface PickedFile {
  path: string;
  name: string;
  size: number;
  mimeType: string | null;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionRecord {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  kind: 'collection' | 'folder';
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RequestRecord {
  id: string;
  workspaceId: string;
  collectionId: string | null;
  folderId: string | null;
  name: string;
  method: HttpMethod;
  url: string;
  queryParams: string;
  headers: string;
  bodyType: RequestBodyType | null;
  body: string | null;
  bodyMeta: string | null;
  authType: string | null;
  authConfig: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnvironmentRecord {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryEntryRecord {
  id: string;
  requestId: string | null;
  workspaceId: string;
  requestSnapshot: string;
  responseSnapshot: string | null;
  statusCode: number | null;
  durationMs: number | null;
  createdAt: string;
}

/** Result of executing an HTTP request */
export interface ExecutionResult {
  statusCode: number;
  statusText: string;
  headers: Array<{ key: string; value: string }>;
  body: string;
  durationMs: number;
  sizeBytes: number;
}

export interface HeaderRecord {
  key: string;
  value: string;
}

export type InspectorResourceType =
  | 'xhr'
  | 'fetch'
  | 'document'
  | 'stylesheet'
  | 'script'
  | 'image'
  | 'media'
  | 'font'
  | 'websocket'
  | 'other';

export type InspectorRequestState = 'pending' | 'success' | 'failed';

export interface NetworkInspectorEntry {
  id: string;
  url: string;
  method: string;
  resourceType: InspectorResourceType;
  state: InspectorRequestState;
  statusCode: number | null;
  statusText: string | null;
  requestHeaders: HeaderRecord[];
  responseHeaders: HeaderRecord[];
  requestBody: string | null;
  responseBody: string | null;
  errorText: string | null;
  startedAt: string;
  durationMs: number | null;
  responseSizeBytes: number | null;
  mimeType: string | null;
}

export type NetworkInspectorEvent =
  | {
      type: 'reset';
    }
  | {
      type: 'upsert';
      entry: NetworkInspectorEntry;
    };

export interface VariableRecord {
  id: string;
  environmentId: string | null;
  workspaceId: string;
  scope: string;
  key: string;
  value: string | null;
  isSecret: boolean;
  createdAt: string;
  updatedAt: string;
}
