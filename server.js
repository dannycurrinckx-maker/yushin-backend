// Render (Node) entrypoint — vervangt de Cloudflare Worker-runtime, NIET de
// applicatielogica zelf: src/index.js exporteert nog steeds gewoon
// `{ fetch(request, env, ctx) }` volgens de standaard Fetch API
// (Request/Response/Headers/URL), en dat bestand blijft ongewijzigd. Dit
// bestand doet enkel het "verpakken": een Node http.Server ontvangt de echte
// TCP-request, zet die om naar een Fetch Request, roept worker.fetch() aan
// (exact zoals Cloudflare dat zelf ook doet), en stuurt de teruggegeven
// Response weer terug als een gewone Node-response.
//
// env.DB is hier de Postgres-adapter (src/lib/pgD1.js) i.p.v. de D1-binding
// — voor de rest van de app (db.js, alle routes) is dat onzichtbaar: die
// roepen allemaal enkel db.prepare(sql).bind(...).run()/.first()/.all() aan.

import http from "node:http";
import worker from "./src/index.js";
import { createPgD1 } from "./src/lib/pgD1.js";

const PORT = process.env.PORT || 10000;

if (!process.env.DATABASE_URL) {
  // Vroeg en luid falen i.p.v. pas bij de eerste binnenkomende request een
  // cryptische connectiefout te tonen.
  console.error("DATABASE_URL ontbreekt — zet deze env var (Render Postgres 'Internal Database URL').");
  process.exit(1);
}

const db = createPgD1(process.env.DATABASE_URL);

// env-object dat overeenkomt met wat wrangler.toml voorheen aanleverde op
// Cloudflare — zelfde namen, zodat src/index.js en alle routes/lib-bestanden
// ONGEWIJZIGD blijven. Secrets/vars worden op Render gezet via de
// service-instellingen (dashboard of update_environment_variables), niet
// hier hardcoded.
function buildEnv() {
  return {
    DB: db,
    APP_ENV: process.env.APP_ENV || "production",
    APP_BASE_URL: process.env.APP_BASE_URL || "",
    NOTIFY_EMAIL: process.env.NOTIFY_EMAIL || "",
    NOTIFY_FROM_EMAIL: process.env.NOTIFY_FROM_EMAIL || "",
    PLATFORM_ADMIN_EMAILS: process.env.PLATFORM_ADMIN_EMAILS || "",
    MOLLIE_API_KEY: process.env.MOLLIE_API_KEY,
    SESSION_SECRET: process.env.SESSION_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  };
}

// Leest het volledige request-lichaam in (klein genoeg hier: JSON-bodies van
// een intakeformulier, geen file-uploads) en geeft het als Buffer terug, of
// undefined voor methodes zonder body (Fetch's Request verbiedt een body bij
// GET/HEAD).
function readBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function toFetchRequest(req, body) {
  const url = `http://${req.headers.host || "localhost"}${req.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  return new Request(url, {
    method: req.method,
    headers,
    body: body && body.length ? body : undefined,
  });
}

async function sendFetchResponse(res, response) {
  res.statusCode = response.status;
  for (const [key, value] of response.headers.entries()) {
    res.setHeader(key, value);
  }
  const buf = Buffer.from(await response.arrayBuffer());
  res.end(buf);
}

const server = http.createServer(async (req, res) => {
  try {
    const body = await readBody(req);
    const request = toFetchRequest(req, body);
    const response = await worker.fetch(request, buildEnv(), {});
    await sendFetchResponse(res, response);
  } catch (err) {
    // BELANGRIJK: ook hier CORS-headers zetten. Zonder deze headers blokkeert
    // de browser dit 500-antwoord stilzwijgend (zelfde probleem als bij een
    // gewone respons, zie de CORS-toelichting in src/index.js) — de client
    // ziet dan een misleidende generieke "kan de server niet bereiken"/
    // "Failed to fetch"-melding in plaats van de echte foutmelding hieronder,
    // wat live problemen (bv. een tijdelijk databankprobleem) onnodig lastig
    // te diagnosticeren maakt.
    console.error("Onverwachte fout tijdens request-afhandeling:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.end(JSON.stringify({ error: "Interne serverfout.", detail: String((err && err.message) || err) }));
  }
});

server.listen(PORT, () => {
  console.log(`Yushin SaaS backend luistert op poort ${PORT} (APP_ENV=${process.env.APP_ENV || "production"})`);
});
