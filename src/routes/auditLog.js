// Auditlog — leesscherm (taak #133, laatste stap van "app-shell koppelen aan
// live sessiedata").
//
// Enkel de praktijkeigenaar mag dit inzien (auth: "owner" in index.js,
// zelfde afspraak als /api/admin/users) — een auditlog van de hele praktijk
// hoort niet zomaar bij elke therapeut in beeld te komen.
//
// Bewust GEEN schrijfroute hier: logregels ontstaan enkel als bijeffect van
// een echte actie elders (zie de recordAuditLogEntry-aanroepen in
// sessions.js, admin.js en auth.js) — nooit rechtstreeks door een client
// aan te sturen, anders zou het logboek zelf onbetrouwbaar worden.

import { jsonResponse } from "../lib/http.js";
import { listAuditLogForOrganization } from "../lib/db.js";

export async function handleListAuditLog(request, env, ctx) {
  // Altijd ctx.session.organizationId — nooit iets uit de request — zie de
  // multi-tenancy-afspraak (taak #69).
  const rows = await listAuditLogForOrganization(env.DB, ctx.session.organizationId);

  const entries = rows.map((row) => ({
    id: row.id,
    actorLabel: row.actor_label,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    detail: row.detail,
    createdAt: row.created_at,
  }));

  return jsonResponse({ entries });
}
