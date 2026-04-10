/**
 * Main-process only: writes to userData/logs and mirrors to console.
 * Do not import from the renderer bundle.
 */
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

function getLogFilePath(): string {
  const dir = path.join(app.getPath('userData'), 'logs');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'deep-cut.log');
}

function writeLine(level: string, message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const line =
    meta === undefined
      ? `[${ts}] [${level}] ${message}\n`
      : `[${ts}] [${level}] ${message} ${safeStringify(meta)}\n`;
  try {
    fs.appendFileSync(getLogFilePath(), line, 'utf8');
  } catch {
    // ignore disk errors
  }
  if (level === 'ERROR') {
    console.error(message, meta ?? '');
  } else if (level === 'WARN') {
    console.warn(message, meta ?? '');
  } else {
    console.log(message, meta ?? '');
  }
}

function safeStringify(meta: unknown): string {
  try {
    return JSON.stringify(meta);
  } catch {
    return '[unserializable]';
  }
}

export function logInfo(message: string, meta?: unknown): void {
  writeLine('INFO', message, meta);
}

export function logWarn(message: string, meta?: unknown): void {
  writeLine('WARN', message, meta);
}

export function logError(message: string, meta?: unknown): void {
  writeLine('ERROR', message, meta);
}
