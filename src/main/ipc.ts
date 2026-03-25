import type { IpcMain } from 'electron';
import { getAppBootstrap } from '../modules/collections/bootstrap-service';
import { listCollections } from '../modules/collections/collection-service';
import {
  createEnvironment,
  deleteEnvironment,
  deleteVariable,
  listEnvironments,
  listVariables,
  saveVariable,
  updateEnvironment,
} from '../modules/environments/environment-service';
import { clearHistory, listHistory } from '../modules/history/history-service';
import { executeRequest } from '../modules/requests/request-executor';
import { listRequests, saveRequestDraft } from '../modules/requests/request-service';
import {
  createEnvironmentSchema,
  executeRequestSchema,
  saveRequestDraftSchema,
  saveVariableSchema,
  updateEnvironmentSchema,
} from '../shared/ipc';

export function registerAppIpc(ipcMain: IpcMain) {
  // Bootstrap
  ipcMain.handle('app:get-bootstrap', async () => getAppBootstrap());

  // Collections
  ipcMain.handle('collections:list', async () => listCollections());

  // Requests
  ipcMain.handle('requests:list', async () => listRequests());
  ipcMain.handle('requests:save-draft', async (_event, input: unknown) => {
    return saveRequestDraft(saveRequestDraftSchema.parse(input));
  });

  // Execute
  ipcMain.handle('requests:execute', async (_event, input: unknown) => {
    return executeRequest(executeRequestSchema.parse(input));
  });

  // History
  ipcMain.handle('history:list', async () => listHistory());
  ipcMain.handle('history:clear', async () => clearHistory());

  // Environments
  ipcMain.handle('environments:list', async () => listEnvironments());
  ipcMain.handle('environments:create', async (_event, input: unknown) => {
    return createEnvironment(createEnvironmentSchema.parse(input));
  });
  ipcMain.handle('environments:update', async (_event, input: unknown) => {
    return updateEnvironment(updateEnvironmentSchema.parse(input));
  });
  ipcMain.handle('environments:delete', async (_event, id: string) => {
    return deleteEnvironment(id);
  });

  // Variables
  ipcMain.handle('variables:list', async (_event, environmentId: string) => {
    return listVariables(environmentId);
  });
  ipcMain.handle('variables:save', async (_event, input: unknown) => {
    return saveVariable(saveVariableSchema.parse(input));
  });
  ipcMain.handle('variables:delete', async (_event, id: string) => {
    return deleteVariable(id);
  });
}
