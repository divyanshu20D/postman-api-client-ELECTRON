import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const environments = sqliteTable('environments', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
