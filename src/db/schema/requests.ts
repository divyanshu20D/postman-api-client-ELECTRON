import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const requests = sqliteTable('requests', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  collectionId: text('collection_id'),
  folderId: text('folder_id'),
  name: text('name').notNull(),
  method: text('method').notNull(),
  url: text('url').notNull(),
  queryParams: text('query_params').notNull(),
  headers: text('headers').notNull(),
  bodyType: text('body_type'),
  body: text('body'),
  bodyMeta: text('body_meta'),
  authType: text('auth_type'),
  authConfig: text('auth_config'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
