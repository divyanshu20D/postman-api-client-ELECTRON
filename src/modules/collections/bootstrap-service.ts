import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { initializeDatabase } from '../../db/bootstrap';
import { db } from '../../db/connection';
import { appSettings, collections, environments, historyEntries, requests, workspaces } from '../../db/schema';
import type { AppBootstrap } from '../../shared/ipc';

const DEFAULT_WORKSPACE_NAME = 'My Workspace';
const DEFAULT_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

function now() {
  return new Date().toISOString();
}

function ensureSeedData() {
  const existingSettings = db.select().from(appSettings).where(eq(appSettings.id, DEFAULT_SETTINGS_ID)).get();
  if (existingSettings?.activeWorkspaceId) {
    return existingSettings.activeWorkspaceId;
  }

  const timestamp = now();
  const workspaceId = randomUUID();

  db.insert(workspaces)
    .values({
      id: workspaceId,
      name: DEFAULT_WORKSPACE_NAME,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();

  db.insert(appSettings)
    .values({
      id: DEFAULT_SETTINGS_ID,
      activeWorkspaceId: workspaceId,
      activeEnvironmentId: null,
      theme: 'system',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();

  return workspaceId;
}

export function getAppBootstrap(): AppBootstrap {
  initializeDatabase();
  const workspaceId = ensureSeedData();
  const workspace = db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).get();

  if (!workspace) {
    throw new Error('Active workspace was not found after bootstrap.');
  }

  return {
    workspace,
    collections: db.select().from(collections).where(eq(collections.workspaceId, workspaceId)).all(),
    requests: db.select().from(requests).where(eq(requests.workspaceId, workspaceId)).all(),
    environments: db.select().from(environments).where(eq(environments.workspaceId, workspaceId)).all(),
    history: db.select().from(historyEntries).where(eq(historyEntries.workspaceId, workspaceId)).all(),
  };
}
