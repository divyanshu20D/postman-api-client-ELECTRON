import { z } from 'zod';
import type {
  BinaryBodyConfig,
  CollectionRecord,
  EnvironmentRecord,
  ExecutionResult,
  FormDataRow,
  HistoryEntryRecord,
  HttpMethod,
  KeyValueRow,
  PickedFile,
  RequestBodyType,
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

const requestBodyTypeSchema = z.enum(['none', 'raw', 'form-data', 'x-www-form-urlencoded', 'binary']);
const executionIdSchema = z.string().uuid();

export const saveRequestDraftSchema = z.object({
  id: z.string().uuid().optional(),
  workspaceId: z.string().uuid(),
  collectionId: z.string().uuid().nullable().optional(),
  folderId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(120),
  method: z.custom<HttpMethod>(),
  url: z.string(),
  queryParams: z.string().default('[]'),
  headers: z.string().default('[]'),
  bodyType: requestBodyTypeSchema.nullable().optional(),
  body: z.string().nullable().optional(),
  bodyMeta: z.string().nullable().optional(),
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
  executionId: executionIdSchema,
  workspaceId: z.string().uuid(),
  requestId: z.string().uuid().nullable().optional(),
  name: z.string(),
  method: z.custom<HttpMethod>(),
  url: z.string().min(1),
  queryParams: z.string().default('[]'),
  headers: z.string().default('[]'),
  bodyType: requestBodyTypeSchema.nullable().optional(),
  body: z.string().nullable().optional(),
  bodyMeta: z.string().nullable().optional(),
  authType: z.string().nullable().optional(),
  authConfig: z.string().nullable().optional(),
});

export type ExecuteRequestInput = z.infer<typeof executeRequestSchema>;

export const cancelRequestExecutionSchema = z.object({
  executionId: executionIdSchema,
});

export type CancelRequestExecutionInput = z.infer<typeof cancelRequestExecutionSchema>;

export const pickFilesInputSchema = z.object({
  multiple: z.boolean().default(false),
});

export type PickFilesInput = z.infer<typeof pickFilesInputSchema>;

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
  pickFiles(input?: PickFilesInput): Promise<PickedFile[]>;

  // Execute
  executeRequest(input: ExecuteRequestInput): Promise<ExecutionResult>;
  cancelRequestExecution(executionId: string): Promise<boolean>;

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
