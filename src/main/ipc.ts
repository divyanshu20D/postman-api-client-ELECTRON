import { dialog } from 'electron';
import path from 'node:path';
import type { IpcMain } from 'electron';
import { getAppBootstrap } from '../modules/collections/bootstrap-service';
import { createCollection, deleteCollection, listCollections, updateCollection } from '../modules/collections/collection-service';
import {
  exportReqKitCollectionToFile,
  importReqKitCollectionFromFile,
} from '../modules/collections/collection-transfer-service';
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
import { deleteRequest, listRequests, saveRequestDraft } from '../modules/requests/request-service';
import {
  cancelRequestExecutionSchema,
  createCollectionSchema,
  createEnvironmentSchema,
  deleteCollectionSchema,
  deleteRequestSchema,
  executeRequestSchema,
  exportCollectionSchema,
  pickFilesInputSchema,
  saveRequestDraftSchema,
  saveVariableSchema,
  updateCollectionSchema,
  updateEnvironmentSchema,
} from '../shared/ipc';

function sanitizeFileName(name: string) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').trim() || 'collection';
}

export function registerAppIpc(ipcMain: IpcMain) {
  // Bootstrap
  ipcMain.handle('app:get-bootstrap', async () => getAppBootstrap());

  // Collections
  ipcMain.handle('collections:list', async () => listCollections());
  ipcMain.handle('collections:create', async (_event, input: unknown) => {
    return createCollection(createCollectionSchema.parse(input));
  });
  ipcMain.handle('collections:update', async (_event, input: unknown) => {
    return updateCollection(updateCollectionSchema.parse(input));
  });
  ipcMain.handle('collections:delete', async (_event, input: unknown) => {
    const { id } = deleteCollectionSchema.parse(input);
    return deleteCollection(id);
  });
  ipcMain.handle('collections:export', async (_event, input: unknown) => {
    const { collectionId } = exportCollectionSchema.parse(input);
    const collection = listCollections().find((item) => item.id === collectionId);
    if (!collection) {
      throw new Error('Collection not found.');
    }

    const result = await dialog.showSaveDialog({
      title: 'Export Collection',
      defaultPath: `${sanitizeFileName(collection.name)}.reqkit_collection.json`,
      filters: [
        {
          name: 'ReqKit Collection',
          extensions: ['json'],
        },
      ],
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    return exportReqKitCollectionToFile(collectionId, result.filePath);
  });
  ipcMain.handle('collections:import', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import Collection',
      properties: ['openFile'],
      filters: [
        {
          name: 'ReqKit Collection',
          extensions: ['json'],
        },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return importReqKitCollectionFromFile(result.filePaths[0]);
  });

  // Requests
  ipcMain.handle('requests:list', async () => listRequests());
  ipcMain.handle('requests:save-draft', async (_event, input: unknown) => {
    return saveRequestDraft(saveRequestDraftSchema.parse(input));
  });
  ipcMain.handle('requests:delete', async (_event, input: unknown) => {
    const { id } = deleteRequestSchema.parse(input);
    return deleteRequest(id);
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
