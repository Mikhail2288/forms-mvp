import { createClient, Client } from '@libsql/client';

// Инициализация асинхронного клиента libSQL.
// Протокол 'file:' гарантирует работу с локальным файлом без внешних зависимостей.
export const db: Client = createClient({
    url: 'file:data.db',
});

export async function initDb(): Promise<void> {
    // Включение режима Write-Ahead Logging
    await db.execute('PRAGMA journal_mode = WAL');

    await db.execute(`
    CREATE TABLE IF NOT EXISTS forms (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    await db.execute(`
    CREATE TABLE IF NOT EXISTS form_fields (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      required INTEGER NOT NULL,
      options TEXT,
      position INTEGER NOT NULL
    )
  `);

    await db.execute(`
    CREATE TABLE IF NOT EXISTS responses (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      data_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    await db.execute(`
    CREATE TABLE IF NOT EXISTS dropoff_events (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      field_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}