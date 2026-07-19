import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { SCHEMA_SQL, VEC_SCHEMA_SQL } from "./schema.js";

export type DB = Database.Database;

export function openDatabase(dbPath: string, embeddingDims: number): DB {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  sqliteVec.load(db);
  db.exec(SCHEMA_SQL);
  db.exec(VEC_SCHEMA_SQL(embeddingDims));
  return db;
}
