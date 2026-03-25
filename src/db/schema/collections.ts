import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const collections = sqliteTable('collections', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  parentId: text('parent_id'),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
