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

function createWorkspace(timestamp: string) {
  const workspaceId = randomUUID();

  db.insert(workspaces)
    .values({
      id: workspaceId,
      name: DEFAULT_WORKSPACE_NAME,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();

  return workspaceId;
}

function ensureSeedData() {
  const existingSettings = db.select().from(appSettings).where(eq(appSettings.id, DEFAULT_SETTINGS_ID)).get();
  if (existingSettings?.activeWorkspaceId) {
    const existingWorkspace = db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, existingSettings.activeWorkspaceId))
      .get();

    if (existingWorkspace) {
      return existingWorkspace.id;
    }
  }

  const timestamp = now();
  const workspaceId = createWorkspace(timestamp);

  if (existingSettings) {
    db.update(appSettings)
      .set({
        activeWorkspaceId: workspaceId,
        updatedAt: timestamp,
      })
      .where(eq(appSettings.id, DEFAULT_SETTINGS_ID))
      .run();

    return workspaceId;
  }

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
  const settings = db.select().from(appSettings).where(eq(appSettings.id, DEFAULT_SETTINGS_ID)).get();

  if (!workspace) {
    throw new Error('Active workspace was not found after bootstrap.');
  }

  return {
    workspace,
    activeEnvironmentId: settings?.activeEnvironmentId ?? null,
    collections: db.select().from(collections).where(eq(collections.workspaceId, workspaceId)).all(),
    requests: db.select().from(requests).where(eq(requests.workspaceId, workspaceId)).all(),
    environments: db.select().from(environments).where(eq(environments.workspaceId, workspaceId)).all(),
    history: db.select().from(historyEntries).where(eq(historyEntries.workspaceId, workspaceId)).all(),
  };
}
