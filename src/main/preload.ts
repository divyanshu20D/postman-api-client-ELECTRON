import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppApi,
  AppBootstrap,
  CancelRequestExecutionInput,
  CreateCollectionInput,
  CreateEnvironmentInput,
  ExecuteRequestInput,
  ExportCollectionInput,
  PickFilesInput,
  SaveRequestDraftInput,
  SaveVariableInput,
  SetActiveEnvironmentInput,
  UpdateCollectionInput,
  UpdateEnvironmentInput,
} from '../shared/ipc';

const api: AppApi = {
  getBootstrap: () => ipcRenderer.invoke('app:get-bootstrap') as Promise<AppBootstrap>,
  listCollections: () => ipcRenderer.invoke('collections:list') as ReturnType<AppApi['listCollections']>,
  createCollection: (input: CreateCollectionInput) =>
    ipcRenderer.invoke('collections:create', input) as ReturnType<AppApi['createCollection']>,
  updateCollection: (input: UpdateCollectionInput) =>
    ipcRenderer.invoke('collections:update', input) as ReturnType<AppApi['updateCollection']>,
  deleteCollection: (id: string) =>
    ipcRenderer.invoke('collections:delete', { id }) as ReturnType<AppApi['deleteCollection']>,
  exportCollection: (input: ExportCollectionInput) =>
    ipcRenderer.invoke('collections:export', input) as ReturnType<AppApi['exportCollection']>,
  importCollection: () =>
    ipcRenderer.invoke('collections:import') as ReturnType<AppApi['importCollection']>,
  listRequests: () => ipcRenderer.invoke('requests:list') as ReturnType<AppApi['listRequests']>,
  saveRequestDraft: (input: SaveRequestDraftInput) =>
    ipcRenderer.invoke('requests:save-draft', input) as ReturnType<AppApi['saveRequestDraft']>,
  deleteRequest: (id: string) =>
    ipcRenderer.invoke('requests:delete', { id }) as ReturnType<AppApi['deleteRequest']>,
  pickFiles: (input?: PickFilesInput) =>
    ipcRenderer.invoke('dialog:pick-files', input ?? {}) as ReturnType<AppApi['pickFiles']>,

  // Execute
  executeRequest: (input: ExecuteRequestInput) =>
    ipcRenderer.invoke('requests:execute', input) as ReturnType<AppApi['executeRequest']>,
  cancelRequestExecution: (executionId: string) =>
    ipcRenderer.invoke('requests:cancel-execution', { executionId } satisfies CancelRequestExecutionInput) as ReturnType<AppApi['cancelRequestExecution']>,

  // History
  listHistory: () => ipcRenderer.invoke('history:list') as ReturnType<AppApi['listHistory']>,
  clearHistory: () => ipcRenderer.invoke('history:clear') as ReturnType<AppApi['clearHistory']>,

  // Environments
  listEnvironments: () => ipcRenderer.invoke('environments:list') as ReturnType<AppApi['listEnvironments']>,
  createEnvironment: (input: CreateEnvironmentInput) =>
    ipcRenderer.invoke('environments:create', input) as ReturnType<AppApi['createEnvironment']>,
  updateEnvironment: (input: UpdateEnvironmentInput) =>
    ipcRenderer.invoke('environments:update', input) as ReturnType<AppApi['updateEnvironment']>,
  deleteEnvironment: (id: string) =>
    ipcRenderer.invoke('environments:delete', id) as ReturnType<AppApi['deleteEnvironment']>,
  setActiveEnvironment: (environmentId: string | null) =>
    ipcRenderer.invoke(
      'environments:set-active',
      { environmentId } satisfies SetActiveEnvironmentInput,
    ) as ReturnType<AppApi['setActiveEnvironment']>,

  // Variables
  listVariables: (environmentId: string) =>
    ipcRenderer.invoke('variables:list', environmentId) as ReturnType<AppApi['listVariables']>,
  saveVariable: (input: SaveVariableInput) =>
    ipcRenderer.invoke('variables:save', input) as ReturnType<AppApi['saveVariable']>,
  deleteVariable: (id: string) =>
    ipcRenderer.invoke('variables:delete', id) as ReturnType<AppApi['deleteVariable']>,
};

contextBridge.exposeInMainWorld('appApi', api);
