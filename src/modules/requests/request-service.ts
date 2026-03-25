import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../../db/connection';
import { appSettings, requests } from '../../db/schema';
import type { SaveRequestDraftInput } from '../../shared/ipc';

const DEFAULT_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

function now() {
  return new Date().toISOString();
}

export function listRequests() {
  const settings = db.select().from(appSettings).where(eq(appSettings.id, DEFAULT_SETTINGS_ID)).get();
  if (!settings?.activeWorkspaceId) {
    return [];
  }

  return db.select().from(requests).where(eq(requests.workspaceId, settings.activeWorkspaceId)).all();
}

export function saveRequestDraft(input: SaveRequestDraftInput) {
  const timestamp = now();
  const id = input.id ?? randomUUID();
  const existing = db.select().from(requests).where(eq(requests.id, id)).get();

  const payload = {
    id,
    workspaceId: input.workspaceId,
    collectionId: input.collectionId ?? null,
    folderId: input.folderId ?? null,
    name: input.name,
    method: input.method,
    url: input.url,
    queryParams: input.queryParams,
    headers: input.headers,
    body: input.body ?? null,
    authType: input.authType ?? null,
    authConfig: input.authConfig ?? null,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  if (existing) {
    db.update(requests).set(payload).where(eq(requests.id, id)).run();
  } else {
    db.insert(requests).values(payload).run();
  }

  return db.select().from(requests).where(eq(requests.id, id)).get()!;
}
