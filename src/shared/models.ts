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
