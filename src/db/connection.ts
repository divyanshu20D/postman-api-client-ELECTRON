import Database from 'better-sqlite3';
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const userDataPath = app.getPath('userData');
const dataDirectory = path.join(userDataPath, 'data');
const databaseFile = path.join(dataDirectory, 'app.db');
const legacyDataDirectory = path.join(app.getPath('appData'), 'local-postman-client', 'data');
const legacyDatabaseFile = path.join(legacyDataDirectory, 'app.db');
const migrationBackupSuffix = '.pre-legacy-migration.bak';

fs.mkdirSync(dataDirectory, { recursive: true });
migrateLegacyDatabase();

const sqlite = new Database(databaseFile);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });
export { schema, databaseFile, sqlite };

function migrateLegacyDatabase() {
  if (!fs.existsSync(legacyDatabaseFile)) {
    return;
  }

  if (!shouldMigrateLegacyDatabase()) {
    return;
  }

  backupCurrentDatabase();
  copyIfPresent(legacyDatabaseFile, databaseFile);
  copyIfPresent(path.join(legacyDataDirectory, 'app.db-wal'), path.join(dataDirectory, 'app.db-wal'));
  copyIfPresent(path.join(legacyDataDirectory, 'app.db-shm'), path.join(dataDirectory, 'app.db-shm'));
}

function copyIfPresent(source: string, destination: string) {
  if (!fs.existsSync(source)) {
    return;
  }

  fs.copyFileSync(source, destination);
}

function shouldMigrateLegacyDatabase() {
  if (!fs.existsSync(databaseFile)) {
    return true;
  }

  const currentStats = fs.statSync(databaseFile);
  if (currentStats.size <= 4096) {
    return true;
  }

  const currentSummary = summarizeDatabase(databaseFile);
  const legacySummary = summarizeDatabase(legacyDatabaseFile);

  return isLikelySeedDatabase(currentSummary) && hasMoreUserData(legacySummary, currentSummary);
}

function summarizeDatabase(file: string) {
  const connection = new Database(file, { readonly: true });

  try {
    return {
      workspaces: countRows(connection, 'workspaces'),
      requests: countRows(connection, 'requests'),
      environments: countRows(connection, 'environments'),
      variables: countRows(connection, 'variables'),
      historyEntries: countRows(connection, 'history_entries'),
    };
  } finally {
    connection.close();
  }
}

function countRows(connection: Database.Database, tableName: string) {
  const row = connection.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as { count: number };
  return row.count;
}

function isLikelySeedDatabase(summary: ReturnType<typeof summarizeDatabase>) {
  return summary.workspaces <= 1
    && summary.requests <= 1
    && summary.environments === 0
    && summary.variables === 0
    && summary.historyEntries === 0;
}

function hasMoreUserData(
  legacySummary: ReturnType<typeof summarizeDatabase>,
  currentSummary: ReturnType<typeof summarizeDatabase>,
) {
  const legacyScore = legacySummary.requests
    + legacySummary.environments
    + legacySummary.variables
    + legacySummary.historyEntries;
  const currentScore = currentSummary.requests
    + currentSummary.environments
    + currentSummary.variables
    + currentSummary.historyEntries;

  return legacyScore > currentScore;
}

function backupCurrentDatabase() {
  if (!fs.existsSync(databaseFile)) {
    return;
  }

  copyIfPresent(databaseFile, `${databaseFile}${migrationBackupSuffix}`);
  copyIfPresent(path.join(dataDirectory, 'app.db-wal'), path.join(dataDirectory, `app.db-wal${migrationBackupSuffix}`));
  copyIfPresent(path.join(dataDirectory, 'app.db-shm'), path.join(dataDirectory, `app.db-shm${migrationBackupSuffix}`));
}
