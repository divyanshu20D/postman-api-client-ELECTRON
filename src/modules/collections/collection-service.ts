import { eq } from 'drizzle-orm';
import { db } from '../../db/connection';
import { appSettings, collections } from '../../db/schema';

const DEFAULT_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

export function listCollections() {
  const settings = db.select().from(appSettings).where(eq(appSettings.id, DEFAULT_SETTINGS_ID)).get();
  if (!settings?.activeWorkspaceId) {
    return [];
  }

  return db
    .select()
    .from(collections)
    .where(eq(collections.workspaceId, settings.activeWorkspaceId))
    .all();
}
