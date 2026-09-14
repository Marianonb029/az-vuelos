import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import type { Database as BaseDeDatos } from "better-sqlite3";

export type Db = BaseDeDatos;

export const abrirDb = (ruta: string, directorioMigraciones: string): Db => {
  if (ruta !== ":memory:") mkdirSync(dirname(ruta), { recursive: true });
  const db = new Database(ruta);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrar(db, directorioMigraciones);
  return db;
};

// Aplica en orden los .sql del directorio que todavía no figuran en la tabla `migraciones`.
export const migrar = (db: Db, directorio: string) => {
  db.exec("CREATE TABLE IF NOT EXISTS migraciones (nombre TEXT PRIMARY KEY, aplicada_en TEXT NOT NULL)");
  const aplicadas = new Set(db.prepare("SELECT nombre FROM migraciones").all().map((f) => (f as { nombre: string }).nombre));
  const archivos = readdirSync(directorio)
    .filter((a) => a.endsWith(".sql"))
    .sort();
  const registrar = db.prepare("INSERT INTO migraciones (nombre, aplicada_en) VALUES (?, ?)");
  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue;
    const sql = readFileSync(join(directorio, archivo), "utf8");
    db.transaction(() => {
      db.exec(sql);
      registrar.run(archivo, new Date().toISOString());
    })();
  }
};
