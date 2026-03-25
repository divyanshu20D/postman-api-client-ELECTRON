import { contextBridge, ipcRenderer } from 'electron';
import type { AppApi, AppBootstrap, CreateEnvironmentInput, ExecuteRequestInput, SaveRequestDraftInput, SaveVariableInput, UpdateEnvironmentInput } from '../shared/ipc';

const api: AppApi = {
  getBootstrap: () => ipcRenderer.invoke('app:get-bootstrap') as Promise<AppBootstrap>,
  listCollections: () => ipcRenderer.invoke('collections:list') as ReturnType<AppApi['listCollections']>,
  listRequests: () => ipcRenderer.invoke('requests:list') as ReturnType<AppApi['listRequests']>,
  saveRequestDraft: (input: SaveRequestDraftInput) =>
    ipcRenderer.invoke('requests:save-draft', input) as ReturnType<AppApi['saveRequestDraft']>,

  // Execute
  executeRequest: (input: ExecuteRequestInput) =>
    ipcRenderer.invoke('requests:execute', input) as ReturnType<AppApi['executeRequest']>,

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

  // Variables
  listVariables: (environmentId: string) =>
    ipcRenderer.invoke('variables:list', environmentId) as ReturnType<AppApi['listVariables']>,
  saveVariable: (input: SaveVariableInput) =>
    ipcRenderer.invoke('variables:save', input) as ReturnType<AppApi['saveVariable']>,
  deleteVariable: (id: string) =>
    ipcRenderer.invoke('variables:delete', id) as ReturnType<AppApi['deleteVariable']>,
};

contextBridge.exposeInMainWorld('appApi', api);
