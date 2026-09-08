/**
 * The currency rename lives entirely in lang/en.json as flat dotted keys that
 * shadow pf2e's own PF2E.Currency.* / PF2E.CurrencyAbbreviations.* entries.
 * There is no code path to exercise, so the failure modes are all data:
 *   - a denomination silently left un-renamed (pf2e's "Gold" leaks through),
 *   - two denominations sharing an abbreviation (every price reads the same),
 *   - a key typo'd into a nested object, which Foundry merges as a NEW branch
 *     instead of overriding, so the rename is a no-op in the world.
 * Run: node tests/currency-labels.test.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const lang = JSON.parse(readFileSync(join(here, "..", "lang", "en.json"), "utf8"));

const DENOMS = ["pp", "gp", "sp", "cp"];

// 1. Every coin denomination is renamed -- none left for pf2e to label.
for (const d of DENOMS) {
  const nameKey = `PF2E.Currency.${d}`;
  const abbrKey = `PF2E.CurrencyAbbreviations.${d}`;
  assert.equal(typeof lang[nameKey], "string", `missing ${nameKey}`);
  assert.equal(typeof lang[abbrKey], "string", `missing ${abbrKey}`);
  assert.ok(lang[nameKey].length, `${nameKey} is empty`);
  assert.ok(lang[abbrKey].length, `${abbrKey} is empty`);
}

// 2. No two denominations share a name or an abbreviation. A collision makes
//    every price on every sheet read identically and is invisible in review.
for (const group of ["PF2E.Currency", "PF2E.CurrencyAbbreviations"]) {
  const vals = DENOMS.map((d) => lang[`${group}.${d}`]);
  assert.equal(new Set(vals).size, DENOMS.length, `duplicate value in ${group}: ${vals.join(", ")}`);
}

// 3. Nothing carries pf2e's default fantasy metals through.
const stale = ["Gold", "Silver", "Copper", "Platinum"];
for (const d of DENOMS) {
  assert.ok(!stale.includes(lang[`PF2E.Currency.${d}`]),
    `PF2E.Currency.${d} still reads as vanilla pf2e`);
}

// 4. gp is the credit peg -- the one abbreviation the rename must change.
assert.equal(lang["PF2E.CurrencyAbbreviations.gp"], "cr");
assert.equal(lang["PF2E.Currency.gp"], "Credit");

// 5. Keys are FLAT dotted strings at the top level, matching the proven
//    "PF2E.Actor.Creature.Language.common" override. A nested { PF2E: { ... } }
//    object here would deep-merge into a sibling branch and override nothing.
assert.ok(!("PF2E" in lang), "PF2E must not appear as a nested object -- use flat dotted keys");
assert.equal(lang["PF2E.Actor.Creature.Language.common"], "Common Cant");

console.log("currency-labels: 5/5 checks passed");
