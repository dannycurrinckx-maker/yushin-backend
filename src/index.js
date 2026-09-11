// Yushin SaaS — Cloudflare Worker entry point.
//
// Bewust géén routing-framework (itty-router e.d.): dit project heeft een
// beperkt aantal routes, en een simpele handmatige router houdt de
// dependency-lijst op nul — relevant omdat er geen npm-registrytoegang was
// tijdens het opzetten van dit project. Werkt identiek op Cloudflare zelf.

import { jsonResponse } from "./lib/http.js";
import { extractSessionToken } from "./lib/auth.js";
import { getAuthSession } from "./lib/db.js";

import {
  handleRegister,
  handleLogin,
  handleLogout,
  handleRequestPasswordReset,
  handleResetPassword,
} from "./routes/auth.js";
import { handleNextQuestion, handleSubmitAnswer, handleGetResult } from "./routes/flow.js";
import { handleStartCheckout, handleMollieWebhook } from "./routes/billing.js";
import { handleListUsers, handleInviteUser, handleRemoveUser } from "./routes/admin.js";
import { handleGetOrganization } from "./routes/organization.js";
import { handleRedeemAccessCode } from "./routes/accessCodes.js";
import { handleListSessions, handleGetSessionDetail, handleSubmitSessionFeedback } from "./routes/sessions.js";
import { handleListAuditLog } from "./routes/auditLog.js";
import { handleCreateAccessCode, handleListAccessCodes } from "./routes/platformAdmin.js";
import {
  handleGetPatientIntakeToken,
  handleCreatePatientIntakeToken,
  handleRevokePatientIntakeToken,
  handlePublicIntakeNext,
  handlePublicIntakeAnswer,
  handlePublicIntakeResult,
} from "./routes/patientIntake.js";

// Bouwt de request-context (ctx) op basis van het sessietoken, indien aanwezig.
// Routes die authenticatie vereisen roepen requireAuth(ctx) aan; routes die
// dat niet doen (bv. /api/auth/login, /api/billing/webhook) negeren dit.
async function buildContext(request, env) {
  const token = extractSessionToken(request);
  if (!token) return { session: null };

  const row = await getAuthSession(env.DB, token);
  if (!row) return { session: null };

  return {
    session: {
      token,
      userId: row.user_id,
      organizationId: row.user_organization_id,
      role: row.user_role,
      email: row.user_email,
    },
  };
}

function requireAuth(ctx) {
  if (!ctx.session) {
    return jsonResponse({ error: "Niet ingelogd." }, 401);
  }
  return null; // geen fout -> mag door
}

function requireOwner(ctx) {
  const authError = requireAuth(ctx);
  if (authError) return authError;
  if (ctx.session.role !== "owner") {
    return jsonResponse({ error: "Enkel toegankelijk voor de praktijkbeheerder." }, 403);
  }
  return null;
}

// Taak #141b — LOS van requireOwner hierboven: dat checkt een organisatierol
// ("owner" van je EIGEN praktijk"), dit checkt een platform-brede
// bevoegdheid (jij, Danny, niet elke klant-eigenaar). env.PLATFORM_ADMIN_EMAILS
// is een kommagescheiden lijst in wrangler.toml — zie de toelichting daar
// voor hoe dat in te vullen.
function requirePlatformAdmin(ctx, env) {
  const authError = requireAuth(ctx);
  if (authError) return authError;
  const allowed = (env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!ctx.session.email || !allowed.includes(ctx.session.email.toLowerCase())) {
    return jsonResponse({ error: "Enkel toegankelijk voor platformbeheer." }, 403);
  }
  return null;
}

const ROUTES = [
  // --- Auth (taak #68) ---
  { method: "POST", path: "/api/auth/register", handler: handleRegister, auth: "none" },
  { method: "POST", path: "/api/auth/login", handler: handleLogin, auth: "none" },
  { method: "POST", path: "/api/auth/logout", handler: handleLogout, auth: "required" },
  { method: "POST", path: "/api/auth/request-password-reset", handler: handleRequestPasswordReset, auth: "none" },
  { method: "POST", path: "/api/auth/reset-password", handler: handleResetPassword, auth: "none" },

  // --- Vraag-flow (taak #71) ---
  // next/result staan bewust op POST (niet GET, zoals oorspronkelijk
  // geschetst): beide hebben een JSON-body nodig (de volledige
  // antwoordenset), en GET-met-body wordt door de Fetch API niet ondersteund.
  { method: "POST", path: "/api/flow/next", handler: handleNextQuestion, auth: "required" },
  { method: "POST", path: "/api/flow/answer", handler: handleSubmitAnswer, auth: "required" },
  { method: "POST", path: "/api/flow/result", handler: handleGetResult, auth: "required" },

  // --- Billing / Mollie (taak #70) ---
  // Enkel de praktijkeigenaar mag het abonnement beheren/wijzigen.
  { method: "POST", path: "/api/billing/checkout", handler: handleStartCheckout, auth: "owner" },
  { method: "POST", path: "/api/billing/webhook", handler: handleMollieWebhook, auth: "none" }, // Mollie zelf kan geen sessietoken meesturen

  // --- Toegangscodes (taak #118) ---
  // Zelfde reden als hierboven: enkel de eigenaar wijzigt de organisatiebrede
  // toegangs-/betaalstatus.
  { method: "POST", path: "/api/access-code/redeem", handler: handleRedeemAccessCode, auth: "owner" },

  // --- Beheer (taak #73) ---
  { method: "GET", path: "/api/admin/users", handler: handleListUsers, auth: "owner" },
  { method: "POST", path: "/api/admin/users", handler: handleInviteUser, auth: "owner" },
  { method: "DELETE", path: "/api/admin/users", handler: handleRemoveUser, auth: "owner" },

  // --- Organisatie-info / onboarding (taak #74) ---
  // Bewust "required" (niet "owner"): elk ingelogd lid van de praktijk mag
  // de eigen organisatienaam/status zien (bv. voor een proefperiode-badge),
  // niet enkel de eigenaar.
  { method: "GET", path: "/api/organization", handler: handleGetOrganization, auth: "required" },

  // --- Patiëntsessies / app-shell (taak #127/#129) ---
  // "required" (niet "owner"): elke ingelogde therapeut mag de eigen
  // afgeronde sessies teruglezen, net als bij /api/organization hierboven.
  { method: "GET", path: "/api/sessions", handler: handleListSessions, auth: "required" },
  // Enige route met een pad-parameter tot nu toe (:sessionId) — vandaar de
  // regex i.p.v. een exacte string, zie matchRoute() hieronder. Blijft
  // bewust een kleine toevoeging aan de handmatige router (geen framework),
  // consistent met de motivatie bovenaan dit bestand.
  {
    method: "GET",
    path: /^\/api\/sessions\/([^/]+)$/,
    paramNames: ["sessionId"],
    handler: handleGetSessionDetail,
    auth: "required",
  },

  // --- Auditlog (taak #133) ---
  // "owner" (niet "required"): zelfde afspraak als /api/admin/users hierboven
  // — een auditlog van de hele praktijk is beheerderskost, niet iets waar elke
  // ingelogde therapeut toegang toe hoort te hebben.
  { method: "GET", path: "/api/admin/audit-log", handler: handleListAuditLog, auth: "owner" },

  // --- Sessiefeedback (taak #141b) ---
  // "required" (niet "owner"): elke therapeut mag feedback achterlaten op
  // zijn EIGEN sessie, zelfde scope-afspraak als /api/sessions hierboven —
  // de eigenaarschapscheck zelf gebeurt in handleSubmitSessionFeedback.
  {
    method: "POST",
    path: /^\/api\/sessions\/([^/]+)\/feedback$/,
    paramNames: ["sessionId"],
    handler: handleSubmitSessionFeedback,
    auth: "required",
  },

  // --- Platform-beheer: toegangscodes (taak #141b) ---
  // "platformAdmin" (NIET "owner"): dit is een platform-brede bevoegdheid,
  // geen organisatierol — zie de toelichting bij requirePlatformAdmin en
  // src/routes/platformAdmin.js.
  { method: "POST", path: "/api/platform-admin/access-codes", handler: handleCreateAccessCode, auth: "platformAdmin" },
  { method: "GET", path: "/api/platform-admin/access-codes", handler: handleListAccessCodes, auth: "platformAdmin" },

  // --- Wachtkamer-QR-intake (taak #134) ---
  // Token-beheer: "required" (niet "owner") — elke therapeut beheert zijn
  // EIGEN deelbare QR-code/link, zelfde scope-afspraak als /api/sessions.
  { method: "GET", path: "/api/patient-intake/token", handler: handleGetPatientIntakeToken, auth: "required" },
  { method: "POST", path: "/api/patient-intake/token", handler: handleCreatePatientIntakeToken, auth: "required" },
  { method: "DELETE", path: "/api/patient-intake/token", handler: handleRevokePatientIntakeToken, auth: "required" },

  // De drie publieke routes hieronder staan bewust op "none" (net als
  // /api/billing/webhook hierboven): de patiënt heeft geen account en kan
  // dus geen Bearer-sessietoken meesturen. De autorisatie gebeurt IN de
  // handler zelf, via het meegestuurde patient_intake_token (zie
  // src/routes/patientIntake.js voor het volledige beveiligingsmodel) —
  // "auth: none" betekent hier dus nadrukkelijk niet "ongecontroleerd",
  // enkel "niet via het gewone ctx.session-mechanisme".
  { method: "POST", path: "/api/public/intake/next", handler: handlePublicIntakeNext, auth: "none" },
  { method: "POST", path: "/api/public/intake/answer", handler: handlePublicIntakeAnswer, auth: "none" },
  { method: "POST", path: "/api/public/intake/result", handler: handlePublicIntakeResult, auth: "none" },
];

// Zoekt de eerst passende route. Ondersteunt zowel een exacte string
// (de meeste routes) als een regex met paramNames (bv. /api/sessions/:id).
// Geeft {route, params} terug, of null als niets past.
function matchRoute(method, pathname) {
  for (const r of ROUTES) {
    if (r.method !== method) continue;
    if (typeof r.path === "string") {
      if (r.path === pathname) return { route: r, params: {} };
      continue;
    }
    const m = pathname.match(r.path);
    if (m) {
      const params = {};
      (r.paramNames || []).forEach((name, i) => {
        params[name] = decodeURIComponent(m[i + 1]);
      });
      return { route: r, params };
    }
  }
  return null;
}

// CORS: de client (statisch gehost, bv. GitHub Pages) draait op een ander
// origin dan deze Worker. Zonder deze headers blokkeert de browser elk
// fetch()-antwoord stilzwijgend (de request lukt server-side wel, maar JS in
// de client krijgt de response niet te zien). Wildcard-origin is hier veilig:
// authenticatie loopt via een Bearer-token in de Authorization-header (zie
// auth.js), niet via cookies, dus er is geen credentials-mode nodig.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request, env, execCtx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return withCors(jsonResponse({ ok: true, env: env.APP_ENV || "unknown" }));
    }

    const found = matchRoute(request.method, url.pathname);
    if (!found) {
      return withCors(jsonResponse({ error: "Niet gevonden." }, 404));
    }
    const { route, params } = found;

    const ctx = await buildContext(request, env);

    if (route.auth === "required") {
      const authError = requireAuth(ctx);
      if (authError) return withCors(authError);
    } else if (route.auth === "owner") {
      const authError = requireOwner(ctx);
      if (authError) return withCors(authError);
    } else if (route.auth === "platformAdmin") {
      const authError = requirePlatformAdmin(ctx, env);
      if (authError) return withCors(authError);
    }

    try {
      return withCors(await route.handler(request, env, ctx, params));
    } catch (err) {
      return withCors(jsonResponse({ error: "Interne fout.", detail: String(err && err.message || err) }, 500));
    }
  },
};
