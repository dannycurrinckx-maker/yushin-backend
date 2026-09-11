// Taak #118 — pure unit-tests op applyDiscount() (src/lib/plans.js). De
// router-/D1-brede integratie (dat het verlaagde bedrag ook echt bij Mollie
// terechtkomt) staat in billing.test.js — dit bestand test enkel de
// rekenkundige functie zelf, inclusief de centen-afronding.

import test from "node:test";
import assert from "node:assert/strict";
import { applyDiscount, getPlan } from "../src/lib/plans.js";

test("applyDiscount: zonder korting (null/undefined/0) blijft het bedrag ongewijzigd", () => {
  const amount = { currency: "EUR", value: "8.95" };
  assert.deepEqual(applyDiscount(amount, null), amount);
  assert.deepEqual(applyDiscount(amount, undefined), amount);
  assert.deepEqual(applyDiscount(amount, 0), amount);
});

test("applyDiscount: 50% korting op 8.95 geeft 4.48 (afgerond)", () => {
  // 8.95 * 0.5 = 4.475 -> Math.round op centen-niveau (447.5 -> 448).
  assert.deepEqual(applyDiscount({ currency: "EUR", value: "8.95" }, 50), {
    currency: "EUR",
    value: "4.48",
  });
});

test("applyDiscount: 100% zou het bedrag op 0.00 zetten (geen speciale uitzondering nodig — komt niet voor via 'free'-codes, die ontgrendelen al vóór checkout)", () => {
  assert.deepEqual(applyDiscount({ currency: "EUR", value: "19.95" }, 100), {
    currency: "EUR",
    value: "0.00",
  });
});

test("applyDiscount: negatieve of ongeldige percentages worden genegeerd (geen korting toegepast)", () => {
  const amount = { currency: "EUR", value: "19.95" };
  assert.deepEqual(applyDiscount(amount, -10), amount);
});

test("applyDiscount: werkt op elk PLANS-bedrag, niet enkel 'solo'", () => {
  const team = getPlan("team");
  assert.deepEqual(applyDiscount(team.amount, 20), { currency: "EUR", value: "15.96" });
});
