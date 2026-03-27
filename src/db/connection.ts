import Database from 'better-sqlite3';
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const userDataPath = app.getPath('userData');
const dataDirectory = path.join(userDataPath, 'data');
const databaseFile = path.join(dataDirectory, 'app.db');

fs.mkdirSync(dataDirectory, { recursive: true });

const sqlite = new Database(databaseFile);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });
export { schema, databaseFile, sqlite };
