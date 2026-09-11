// D1-vormige adapter rond een 'pg' Pool (Render Postgres), zodat src/lib/db.js
// en alle routes — die allemaal enkel via db.prepare(sql).bind(...).run()/
// .first()/.all() werken, nooit rechtstreeks met D1- of Postgres-specifieke
// API's — ONGEWIJZIGD kunnen blijven werken, ongeacht welke database eronder
// zit. Zie tests/fake-d1.js voor het test-equivalent (SQLite via node:sqlite).
//
// Bewust géén algemene SQLite->Postgres SQL-vertaler: enkel de twee dingen die
// dit codebase daadwerkelijk gebruikt (datetime('now') en ?-placeholders)
// worden vertaald. Alle andere SQL (CHECK, FK's, ON CONFLICT/EXCLUDED,
// UNIQUE-indexen, LOWER()) is tussen SQLite en Postgres identiek en blijft dus
// onaangeroerd.

import pg from "pg";

// COUNT(*) geeft in Postgres een bigint (OID 20) terug, dat 'pg' standaard als
// string teruggeeft (JS Number kan niet elke bigint-waarde veilig
// voorstellen). Voor deze applicatie — tellers als "aantal gebruikers in een
// praktijk" — blijven de waarden ver binnen de veilige integer-range, dus
// parsen we bigint-kolommen hier bewust naar een gewoon getal, net als
// SQLite dat altijd al deed (zie bv. countActiveUsersForOrganization in
// db.js, die met >= vergelijkt).
pg.types.setTypeParser(20, (value) => parseInt(value, 10));

function toPgSql(sql) {
  return sql.replace(/datetime\('now'\)/g, "NOW()");
}

// Vertaalt positionele "?"-placeholders (D1/SQLite-stijl) naar Postgres' eigen
// $1, $2, ...-stijl. Veilig hier: geen enkele query in dit codebase bevat een
// letterlijk "?"-teken in een stringwaarde of commentaar.
function toPgParams(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

class PgStatement {
  constructor(pool, sql) {
    this.pool = pool;
    this.sql = toPgParams(toPgSql(sql));
    this.params = [];
  }

  bind(...args) {
    this.params = args;
    return this;
  }

  async run() {
    await this.pool.query(this.sql, this.params);
    return { success: true };
  }

  async first() {
    const { rows } = await this.pool.query(this.sql, this.params);
    return rows[0] || null;
  }

  async all() {
    const { rows } = await this.pool.query(this.sql, this.params);
    return { results: rows };
  }
}

// connectionString: de DATABASE_URL van de Render Postgres-instantie.
// Render-interne connecties lopen al over een privénetwerk zonder SSL-eis;
// externe connectiestrings (bv. lokaal testen) vereisen wel SSL — vandaar
// ssl hieronder conditioneel enkel wanneer nodig, nooit hardcoded uit.
export function createPgD1(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    ssl: connectionString.includes("render.com") ? { rejectUnauthorized: false } : false,
  });

  return {
    prepare(sql) {
      return new PgStatement(pool, sql);
    },
    // Enkel gebruikt door scripts/migrate-postgres.mjs (schema toepassen) —
    // de applicatiecode (db.js) gebruikt uitsluitend prepare() hierboven,
    // exact zoals bij de D1-binding.
    async exec(sql) {
      await pool.query(sql);
    },
    async end() {
      await pool.end();
    },
  };
}
