// Test-only D1-shim bovenop Node's ingebouwde node:sqlite, zodat we de
// ECHTE productiecode (src/lib/db.js, src/routes/*.js) kunnen testen tegen
// een echte SQL-engine met het echte migratieschema — niet een losse
// hand-geschreven mock die de logica dupliceert (en dus los kan raken van
// wat de queries écht doen).
//
// D1's binding-API is async; node:sqlite (DatabaseSync) is synchroon. Deze
// shim wrapt gewoon in Promise.resolve() zodat de aanroepcode (die altijd
// await gebruikt) niets van het verschil merkt.

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createFakeD1() {
  const raw = new DatabaseSync(":memory:");

  const migrationsDir = path.join(__dirname, "..", "migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    raw.exec(sql);
  }

  return {
    prepare(sql) {
      const stmt = raw.prepare(sql);
      let boundArgs = [];
      return {
        bind(...args) {
          boundArgs = args;
          return this;
        },
        async first() {
          const row = stmt.get(...boundArgs);
          return row === undefined ? null : row;
        },
        async all() {
          const rows = stmt.all(...boundArgs);
          return { results: rows };
        },
        async run() {
          const info = stmt.run(...boundArgs);
          return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
        },
      };
    },
    _raw: raw,
  };
}
