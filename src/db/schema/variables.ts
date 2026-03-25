import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const variables = sqliteTable('variables', {
  id: text('id').primaryKey(),
  environmentId: text('environment_id'),
  workspaceId: text('workspace_id').notNull(),
  scope: text('scope').notNull(),
  key: text('key').notNull(),
  value: text('value'),
  isSecret: integer('is_secret', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
