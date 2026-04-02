import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

type LogLevel = 'INFO' | 'WARN' | 'ERROR';
type LogChannel = 'main' | 'renderer';

function ensureLogsDirectory() {
  const logsDirectory = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(logsDirectory, { recursive: true });
  return logsDirectory;
}

function getLogFilePath(channel: LogChannel) {
  return path.join(ensureLogsDirectory(), `${channel}.log`);
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  return error;
}

function appendLog(channel: LogChannel, level: LogLevel, message: string, details?: unknown) {
  const timestamp = new Date().toISOString();
  const payload = details === undefined ? '' : ` ${JSON.stringify(normalizeError(details), null, 2)}`;
  const line = `[${timestamp}] [${level}] ${message}${payload}\n`;

  try {
    fs.appendFileSync(getLogFilePath(channel), line, 'utf8');
  } catch (error) {
    // Fall back to stderr so logging failures are still visible during manual runs.
    process.stderr.write(`Failed to write ${channel} log: ${String(error)}\n`);
    process.stderr.write(line);
  }
}

export function getLogsDirectory() {
  return ensureLogsDirectory();
}

export function getMainLogPath() {
  return getLogFilePath('main');
}

export function getRendererLogPath() {
  return getLogFilePath('renderer');
}

export function logMainInfo(message: string, details?: unknown) {
  appendLog('main', 'INFO', message, details);
}

export function logMainWarn(message: string, details?: unknown) {
  appendLog('main', 'WARN', message, details);
}

export function logMainError(message: string, details?: unknown) {
  appendLog('main', 'ERROR', message, details);
}

export function logRendererInfo(message: string, details?: unknown) {
  appendLog('renderer', 'INFO', message, details);
}

export function logRendererWarn(message: string, details?: unknown) {
  appendLog('renderer', 'WARN', message, details);
}

export function logRendererError(message: string, details?: unknown) {
  appendLog('renderer', 'ERROR', message, details);
}
