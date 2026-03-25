import { sql } from 'drizzle-orm';
import { db } from './connection';

let initialized = false;

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
      body text,
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

  initialized = true;
}
