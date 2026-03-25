import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/connection';
import { appSettings, historyEntries } from '../../db/schema';

const DEFAULT_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

function getActiveWorkspaceId(): string | null {
  const settings = db.select().from(appSettings).where(eq(appSettings.id, DEFAULT_SETTINGS_ID)).get();
  return settings?.activeWorkspaceId ?? null;
}

export function listHistory() {
  const workspaceId = getActiveWorkspaceId();
  if (!workspaceId) return [];

  return db
    .select()
    .from(historyEntries)
    .where(eq(historyEntries.workspaceId, workspaceId))
    .orderBy(desc(historyEntries.createdAt))
    .all();
}

export function clearHistory() {
  const workspaceId = getActiveWorkspaceId();
  if (!workspaceId) return;

  db.delete(historyEntries).where(eq(historyEntries.workspaceId, workspaceId)).run();
}
