// Voert migrations-postgres/*.sql in bestandsvolgorde uit tegen DATABASE_URL.
// Node-equivalent van "npm run db:migrate:remote" (dat wrangler d1 execute
// per D1-migratiebestand aanriep) — hier is er geen wrangler/D1 meer, dus dit
// kleine scriptje neemt die rol over voor Render Postgres.
//
// Idempotent: elke migratie gebruikt zelf al "IF NOT EXISTS"/"ADD COLUMN IF
// NOT EXISTS", dus dit script mag gerust opnieuw gedraaid worden (bv. na een
// nieuwe migratie toevoegen) zonder dat het bestaande schema stukgaat.

import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const MIGRATIONS_DIR = new URL("../migrations-postgres/", import.meta.url);

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL ontbreekt. Zet deze env var (Render Postgres connection string) en probeer opnieuw.");
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("render.com") ? { rejectUnauthorized: false } : false,
  });

  try {
    const files = (await fs.readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort(); // bestandsnamen zijn 0001_, 0002_, ... — alfabetisch = chronologisch

    for (const file of files) {
      const fullPath = path.join(new URL(MIGRATIONS_DIR).pathname, file);
      const sql = await fs.readFile(fullPath, "utf8");
      process.stdout.write(`-> ${file} ... `);
      await pool.query(sql);
      console.log("ok");
    }

    console.log(`Klaar — ${files.length} migratie(s) toegepast.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migratie mislukt:", err);
  process.exit(1);
});
