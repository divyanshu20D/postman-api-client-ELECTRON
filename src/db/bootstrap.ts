import { sql } from 'drizzle-orm';
import { db, sqlite } from './connection';

let initialized = false;

function ensureColumn(tableName: string, columnName: string, definition: string) {
  const columns = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  const exists = columns.some((column) => column.name === columnName);
  if (!exists) {
    sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

export function initializeDatabase() {
  if (initialized) {
    return;
  }

  db.run(sql`
    CREATE TABLE IF NOT EXISTS workspaces (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      created_at text NOT NULL,
      updated_at text NOT NULL
    );
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS collections (
      id text PRIMARY KEY NOT NULL,
      workspace_id text NOT NULL,
      parent_id text,
      name text NOT NULL,
      kind text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      created_at text NOT NULL,
      updated_at text NOT NULL
    );
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS requests (
      id text PRIMARY KEY NOT NULL,
      workspace_id text NOT NULL,
      collection_id text,
      folder_id text,
      name text NOT NULL,
      method text NOT NULL,
      url text NOT NULL,
      query_params text NOT NULL,
      headers text NOT NULL,
      body_type text,
      body text,
      body_meta text,
      auth_type text,
      auth_config text,
      created_at text NOT NULL,
      updated_at text NOT NULL
    );
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS environments (
      id text PRIMARY KEY NOT NULL,
      workspace_id text NOT NULL,
      name text NOT NULL,
      created_at text NOT NULL,
      updated_at text NOT NULL
    );
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS variables (
      id text PRIMARY KEY NOT NULL,
      environment_id text,
      workspace_id text NOT NULL,
      scope text NOT NULL,
      key text NOT NULL,
      value text,
      is_secret integer NOT NULL DEFAULT 0,
      created_at text NOT NULL,
      updated_at text NOT NULL
    );
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS history_entries (
      id text PRIMARY KEY NOT NULL,
      request_id text,
      workspace_id text NOT NULL,
      request_snapshot text NOT NULL,
      response_snapshot text,
      status_code integer,
      duration_ms integer,
      created_at text NOT NULL
    );
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      id text PRIMARY KEY NOT NULL,
      active_workspace_id text,
      active_environment_id text,
      theme text NOT NULL DEFAULT 'system',
      created_at text NOT NULL,
      updated_at text NOT NULL
    );
  `);

  ensureColumn('requests', 'body_type', 'text');
  ensureColumn('requests', 'body_meta', 'text');

  initialized = true;
}
