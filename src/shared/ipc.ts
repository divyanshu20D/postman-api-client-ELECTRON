import { z } from 'zod';
import type {
  CollectionRecord,
  EnvironmentRecord,
  ExecutionResult,
  HistoryEntryRecord,
  HttpMethod,
  RequestRecord,
  VariableRecord,
  WorkspaceRecord,
} from './models';

export interface AppBootstrap {
  workspace: WorkspaceRecord;
  collections: CollectionRecord[];
  requests: RequestRecord[];
  environments: EnvironmentRecord[];
  history: HistoryEntryRecord[];
}

export const saveRequestDraftSchema = z.object({
  id: z.string().uuid().optional(),
  workspaceId: z.string().uuid(),
  collectionId: z.string().uuid().nullable().optional(),
  folderId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(120),
  method: z.custom<HttpMethod>(),
  url: z.string().min(1),
  queryParams: z.string().default('[]'),
  headers: z.string().default('[]'),
  body: z.string().nullable().optional(),
  authType: z.string().nullable().optional(),
  authConfig: z.string().nullable().optional(),
});

export type SaveRequestDraftInput = z.infer<typeof saveRequestDraftSchema>;

/* ===== Environment inputs ===== */

export const createEnvironmentSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(120),
});

export type CreateEnvironmentInput = z.infer<typeof createEnvironmentSchema>;

export const updateEnvironmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
});

export type UpdateEnvironmentInput = z.infer<typeof updateEnvironmentSchema>;

export const saveVariableSchema = z.object({
  id: z.string().uuid().optional(),
  environmentId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  key: z.string().min(1).max(200),
  value: z.string().nullable().optional(),
  isSecret: z.boolean().default(false),
});

export type SaveVariableInput = z.infer<typeof saveVariableSchema>;

/* ===== Execute request ===== */

export const executeRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  requestId: z.string().uuid().nullable().optional(),
  name: z.string(),
  method: z.custom<HttpMethod>(),
  url: z.string().min(1),
  queryParams: z.string().default('[]'),
  headers: z.string().default('[]'),
  body: z.string().nullable().optional(),
  authType: z.string().nullable().optional(),
  authConfig: z.string().nullable().optional(),
});

export type ExecuteRequestInput = z.infer<typeof executeRequestSchema>;

/* ===== History inputs ===== */

export const deleteHistoryEntrySchema = z.object({
  id: z.string().uuid(),
});

/* ===== API contract ===== */

export interface AppApi {
  getBootstrap(): Promise<AppBootstrap>;
  listCollections(): Promise<CollectionRecord[]>;
  listRequests(): Promise<RequestRecord[]>;
  saveRequestDraft(input: SaveRequestDraftInput): Promise<RequestRecord>;

  // Execute
  executeRequest(input: ExecuteRequestInput): Promise<ExecutionResult>;

  // History
  listHistory(): Promise<HistoryEntryRecord[]>;
  clearHistory(): Promise<void>;

  // Environments
  listEnvironments(): Promise<EnvironmentRecord[]>;
  createEnvironment(input: CreateEnvironmentInput): Promise<EnvironmentRecord>;
  updateEnvironment(input: UpdateEnvironmentInput): Promise<EnvironmentRecord>;
  deleteEnvironment(id: string): Promise<void>;

  // Variables
  listVariables(environmentId: string): Promise<VariableRecord[]>;
  saveVariable(input: SaveVariableInput): Promise<VariableRecord>;
  deleteVariable(id: string): Promise<void>;
}
