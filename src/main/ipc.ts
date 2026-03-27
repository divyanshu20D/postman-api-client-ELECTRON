import { dialog } from 'electron';
import path from 'node:path';
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
import { cancelRequestExecution, executeRequest } from '../modules/requests/request-executor';
import { listRequests, saveRequestDraft } from '../modules/requests/request-service';
import {
  cancelRequestExecutionSchema,
  createEnvironmentSchema,
  executeRequestSchema,
  pickFilesInputSchema,
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
  ipcMain.handle('dialog:pick-files', async (_event, input: unknown) => {
    const { multiple } = pickFilesInputSchema.parse(input ?? {});
    const result = await dialog.showOpenDialog({
      properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    });

    if (result.canceled) {
      return [];
    }

    return result.filePaths.map((filePath) => ({
      path: filePath,
      name: path.basename(filePath),
      size: 0,
      mimeType: null,
    }));
  });

  // Execute
  ipcMain.handle('requests:execute', async (_event, input: unknown) => {
    return executeRequest(executeRequestSchema.parse(input));
  });
  ipcMain.handle('requests:cancel-execution', async (_event, input: unknown) => {
    const { executionId } = cancelRequestExecutionSchema.parse(input);
    return cancelRequestExecution(executionId);
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
