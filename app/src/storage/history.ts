import * as SQLite from "expo-sqlite";

export interface CallHistoryEntry {
  id: number;
  peer: string;
  direction: "outgoing" | "incoming";
  timestamp: number; // ms since epoch
  durationSeconds: number;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("legonline.db").then(async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS call_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          peer TEXT NOT NULL,
          direction TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          durationSeconds INTEGER NOT NULL
        );
      `);
      return db;
    });
  }
  return dbPromise;
}

export async function addCallToHistory(entry: Omit<CallHistoryEntry, "id">): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO call_history (peer, direction, timestamp, durationSeconds) VALUES (?, ?, ?, ?)",
    entry.peer,
    entry.direction,
    entry.timestamp,
    entry.durationSeconds
  );
}

export async function getCallHistory(): Promise<CallHistoryEntry[]> {
  const db = await getDb();
  return db.getAllAsync<CallHistoryEntry>("SELECT * FROM call_history ORDER BY timestamp DESC");
}

export async function deleteCallHistoryEntry(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM call_history WHERE id = ?", id);
}

export async function clearCallHistory(): Promise<void> {
  const db = await getDb();
  await db.execAsync("DELETE FROM call_history");
}
