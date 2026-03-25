import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const historyEntries = sqliteTable('history_entries', {
  id: text('id').primaryKey(),
  requestId: text('request_id'),
  workspaceId: text('workspace_id').notNull(),
  requestSnapshot: text('request_snapshot').notNull(),
  responseSnapshot: text('response_snapshot'),
  statusCode: integer('status_code'),
  durationMs: integer('duration_ms'),
  createdAt: text('created_at').notNull(),
});
