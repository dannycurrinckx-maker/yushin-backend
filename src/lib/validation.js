// Kleine, dependency-vrije validatiehelpers.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email) {
  return typeof email === "string" && EMAIL_RE.test(email.trim()) && email.length <= 254;
}

export function isValidPassword(password) {
  // Bewust eenvoudig: lengte-eis, geen verplichte tekencombinaties (die
  // duwen gebruikers vaak naar voorspelbare patronen). NIST-richtlijnen
  // raden net dit soort simpele lengte-eis aan i.p.v. complexiteitsregels.
  return typeof password === "string" && password.length >= 10 && password.length <= 200;
}

export function isNonEmptyString(value, maxLength = 200) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}
