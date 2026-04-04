import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type {
  AppApi,
  AppBootstrap,
  AttachNetworkInspectorInput,
  CancelRequestExecutionInput,
  CreateCollectionInput,
  CreateEnvironmentInput,
  ExecuteRequestInput,
  ExportCollectionInput,
  LogPaths,
  PickFilesInput,
  RendererLogInput,
  SaveRequestDraftInput,
  SaveVariableInput,
  SetActiveEnvironmentInput,
  UpdateCollectionInput,
  UpdateEnvironmentInput,
} from '../shared/ipc';
import type { NetworkInspectorEvent } from '../shared/models';

const api: AppApi = {
  getBootstrap: () => ipcRenderer.invoke('app:get-bootstrap') as Promise<AppBootstrap>,
  getLogPaths: () => ipcRenderer.invoke('app:get-log-paths') as Promise<LogPaths>,
  attachNetworkInspector: (input: AttachNetworkInspectorInput) =>
    ipcRenderer.invoke('inspector:attach', input) as ReturnType<AppApi['attachNetworkInspector']>,
  detachNetworkInspector: () =>
    ipcRenderer.invoke('inspector:detach') as ReturnType<AppApi['detachNetworkInspector']>,
  clearNetworkInspector: () =>
    ipcRenderer.invoke('inspector:clear') as ReturnType<AppApi['clearNetworkInspector']>,
  getNetworkInspectorEntries: () =>
    ipcRenderer.invoke('inspector:list') as ReturnType<AppApi['getNetworkInspectorEntries']>,
  onNetworkInspectorEvent: (listener: (event: NetworkInspectorEvent) => void) => {
    const wrappedListener = (_event: IpcRendererEvent, payload: NetworkInspectorEvent) => {
      listener(payload);
    };

    ipcRenderer.on('inspector:event', wrappedListener);
    return () => {
      ipcRenderer.removeListener('inspector:event', wrappedListener);
    };
  },
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

function sendRendererLog(payload: RendererLogInput) {
  void ipcRenderer.invoke('logs:renderer', payload).catch(() => {
    // Avoid throwing from preload while trying to log failures.
  });
}

sendRendererLog({
  level: 'info',
  message: 'Preload initialized',
  details: {
    href: window.location.href,
    userAgent: navigator.userAgent,
  },
});

window.addEventListener('error', (event) => {
  sendRendererLog({
    level: 'error',
    message: 'Unhandled renderer error',
    details: {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error instanceof Error
        ? {
            name: event.error.name,
            message: event.error.message,
            stack: event.error.stack ?? null,
          }
        : event.error ?? null,
    },
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error
    ? {
        name: event.reason.name,
        message: event.reason.message,
        stack: event.reason.stack ?? null,
      }
    : event.reason;

  sendRendererLog({
    level: 'error',
    message: 'Unhandled renderer promise rejection',
    details: { reason },
  });
});
