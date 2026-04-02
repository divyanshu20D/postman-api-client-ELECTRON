import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../../db/connection';
import { appSettings, collections, historyEntries, requests } from '../../db/schema';
import type { CreateCollectionInput, DeleteCollectionResult, UpdateCollectionInput } from '../../shared/ipc';

const DEFAULT_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

function now() {
  return new Date().toISOString();
}

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

export function createCollection(input: CreateCollectionInput) {
  const timestamp = now();
  const id = randomUUID();
  const existingCount = db
    .select()
    .from(collections)
    .where(eq(collections.workspaceId, input.workspaceId))
    .all().length;

  db.insert(collections)
    .values({
      id,
      workspaceId: input.workspaceId,
      parentId: input.parentId ?? null,
      name: input.name,
      kind: input.kind,
      sortOrder: existingCount,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();

  return db.select().from(collections).where(eq(collections.id, id)).get()!;
}

export function updateCollection(input: UpdateCollectionInput) {
  const existing = db.select().from(collections).where(eq(collections.id, input.id)).get();
  if (!existing) {
    throw new Error('Collection not found.');
  }

  db.update(collections)
    .set({
      name: input.name,
      updatedAt: now(),
    })
    .where(eq(collections.id, input.id))
    .run();

  return db.select().from(collections).where(eq(collections.id, input.id)).get()!;
}

function getDescendantFolderIds(allCollections: Array<typeof collections.$inferSelect>, parentId: string): string[] {
  const directChildren = allCollections
    .filter((item) => item.kind === 'folder' && item.parentId === parentId)
    .map((item) => item.id);

  return directChildren.flatMap((childId) => [childId, ...getDescendantFolderIds(allCollections, childId)]);
}

export function deleteCollection(id: string): DeleteCollectionResult {
  const existing = db.select().from(collections).where(eq(collections.id, id)).get();
  if (!existing) {
    throw new Error('Collection not found.');
  }

  const workspaceCollections = db
    .select()
    .from(collections)
    .where(eq(collections.workspaceId, existing.workspaceId))
    .all();
  const descendantFolderIds = getDescendantFolderIds(workspaceCollections, id);
  const deletedCollectionIds = [id, ...descendantFolderIds];
  const workspaceRequests = db
    .select()
    .from(requests)
    .where(eq(requests.workspaceId, existing.workspaceId))
    .all();
  const deletedRequests = existing.kind === 'collection'
    ? workspaceRequests.filter((request) => request.collectionId === existing.id)
    : workspaceRequests.filter((request) => request.folderId !== null && deletedCollectionIds.includes(request.folderId));
  const deletedRequestIds = deletedRequests.map((request) => request.id);

  if (deletedRequestIds.length > 0) {
    db.delete(historyEntries).where(inArray(historyEntries.requestId, deletedRequestIds)).run();
    db.delete(requests).where(inArray(requests.id, deletedRequestIds)).run();
  }

  db.delete(collections).where(inArray(collections.id, deletedCollectionIds)).run();

  return {
    deletedCollectionCount: deletedCollectionIds.length,
    deletedRequestCount: deletedRequestIds.length,
  };
}
