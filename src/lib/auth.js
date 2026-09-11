// Wachtwoord-hashing en sessietokens, volledig gebouwd op de Web Crypto API
// (beschikbaar in de Workers-runtime, geen externe dependency zoals bcrypt nodig).

// OWASP (2024+) beveelt 210.000 iteraties aan voor PBKDF2-SHA256, maar de
// Cloudflare Workers-runtime staat via Web Crypto maximaal 100.000 iteraties
// toe (hogere waarden gooien "Pbkdf2 failed: iteration counts above 100000
// are not supported" — ontdekt op 2026-08-22 toen élke registratie hierdoor
// met een 500 faalde). 100.000 is dus het platform-maximum, niet de
// OWASP-voorkeur; dat is een bewuste, geforceerde afwijking.
const PBKDF2_ITERATIONS = 100000;

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256
  );
  // Opgeslagen formaat: pbkdf2$<iteraties>$<salt-hex>$<hash-hex>
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(derivedBits)}`;
}

export async function verifyPassword(password, stored) {
  const parts = (stored || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[1], 10);
  const salt = fromHex(parts[2]);
  const expectedHex = parts[3];

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  const actualHex = toHex(derivedBits);

  // Constant-time vergelijking om timing-aanvallen te voorkomen.
  if (actualHex.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < actualHex.length; i++) {
    diff |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return diff === 0;
}

export function newSessionToken() {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export function sessionExpiryIso(days = 30) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// Haalt het sessietoken uit de Authorization-header ("Bearer <token>") of
// uit een cookie genaamd "yushin_session" (voor server-rendered flows later).
export function extractSessionToken(request) {
  const authHeader = request.headers.get("Authorization") || "";
  if (authHeader.startsWith("Bearer ")) return authHeader.slice(7).trim();

  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)yushin_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
