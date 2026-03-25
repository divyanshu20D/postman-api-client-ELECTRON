import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const appSettings = sqliteTable('app_settings', {
  id: text('id').primaryKey(),
  activeWorkspaceId: text('active_workspace_id'),
  activeEnvironmentId: text('active_environment_id'),
  theme: text('theme').notNull().default('system'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
