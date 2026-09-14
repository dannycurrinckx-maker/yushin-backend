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
  // Stap 1: datetime('now') (SQLite) -> NOW() (Postgres).
  // Stap 2: expires_at is in het schema een TEXT-kolom (ISO 8601-strings,
  // geschreven via sessionExpiryIso()/toISOString() in auth.js) — géén
  // native timestamp-kolom. "expires_at > NOW()" faalt daardoor in Postgres
  // met "operator does not exist: text > timestamp with time zone" (anders
  // dan in SQLite, waar TEXT-vergelijking met een datetime-string prima
  // werkt). Enkel dit specifieke, letterlijke patroon (twee bekende queries
  // in db.js: getAuthSession en getValidPasswordResetToken) krijgt een
  // expliciete cast — geen algemene kolomvertaler, zie toelichting bovenaan.
  return sql
    .replace(/datetime\('now'\)/g, "NOW()")
    .replace(/expires_at > NOW\(\)/g, "expires_at::timestamptz > NOW()");
}

// Vertaalt positionele "?"-placeholders (D1/SQLite-stijl) naar Postgres' eigen
// $1, $2, ...-stijl. Veilig hier: geen enkele query in dit codebase bevat een
// letterlijk "?"-teken in een stringwaarde of commentaar.
function toPgParams(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => "$" + ++i);
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

// connectionString: de DATABASE_URL van de Postgres-instantie (Neon, sinds de
// migratie weg van Cloudflare D1 — zie migrations-postgres/). Neon vereist
// altijd SSL/TLS, ongeacht of de connectie van Render naar Neon loopt (dus
// NOOIT "intern" zonder SSL, in tegenstelling tot een vroegere aanname hier
// toen nog Render Postgres overwogen werd). Enkel bij een letterlijk lokale
// connectie (localhost/127.0.0.1, bv. tijdens ontwikkeling met een lokale
// Postgres) is SSL uit — voor alles daarbuiten (incl. neon.tech) staat SSL
// altijd aan. rejectUnauthorized: false omdat Neon/Render een gedeeld
// CA-certificaat gebruiken dat Node's ingebouwde CA-lijst niet altijd
// herkent (zelfde patroon als de meeste managed-Postgres-aanbieders).
export function createPgD1(connectionString) {
  const isLocal = /^(postgres(?:ql)?:\/\/)?[^@]*@?(localhost|127\.0\.0\.1)/.test(connectionString);
  const pool = new pg.Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
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
