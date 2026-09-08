/**
 * Tests scripts/main.js `extendRarityChoices` against a mock of Foundry's
 * schema shape. Run: node tests/rarity-choices.test.mjs
 *
 * The function is EXTRACTED from main.js at run time rather than duplicated
 * here, so this tests the shipped code and cannot drift from it.
 *
 * What it would have caught: pushing onto pf2e's Object.freeze'd RARITIES
 * (a TypeError in strict mode that would abort setup and silently leave the
 * rarity dropdown registered but unusable), a duplicate patch on a second
 * setup, and a hang on a self-referential schema.
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "scripts", "main.js"), "utf8");
const i = src.indexOf("function extendRarityChoices");
assert.ok(i >= 0, "extendRarityChoices not found in scripts/main.js");
let depth = 0, end = -1;
for (let k = src.indexOf("{", i); k < src.length; k++) {
  if (src[k] === "{") depth++;
  else if (src[k] === "}" && --depth === 0) { end = k + 1; break; }
}
assert.ok(end > 0, "could not brace-match extendRarityChoices");
const tmp = join(mkdtempSync(join(tmpdir(), "cinderfall-")), "fn.mjs");
writeFileSync(tmp, "export " + src.slice(i, end) + "\n");
const { extendRarityChoices } = await import(pathToFileURL(tmp).href);

const RARITIES = Object.freeze(["common", "uncommon", "rare", "unique"]);
const EXTRA = ["epic", "legendary", "mythic", "exotic"];
const mkField = () => ({ constructor: { name: "RarityField" }, choices: RARITIES });
const mkSchema = (r) => ({ fields: { traits: { fields: { rarity: r, value: {} } }, level: {} } });

const f = mkField(); const found = [];
extendRarityChoices(mkSchema(f), EXTRA, found, "Item.feat.");
assert.deepStrictEqual(f.choices, [...RARITIES, ...EXTRA], "nested rarity widened");
assert.deepStrictEqual(found, ["Item.feat.traits.rarity"], "path reported");

assert.strictEqual(RARITIES.length, 4, "pf2e RARITIES must not be mutated");
assert.ok(Object.isFrozen(RARITIES), "pf2e RARITIES still frozen");

const found2 = [];
extendRarityChoices(mkSchema(f), EXTRA, found2, "Item.feat.");
assert.deepStrictEqual(found2, [], "idempotent: no re-patch");
assert.strictEqual(f.choices.length, 8, "idempotent: no duplicates");

const loop = {}; loop.fields = { self: loop, traits: { fields: { rarity: mkField() } } };
const found4 = [];
extendRarityChoices(loop, EXTRA, found4, "");
assert.ok(found4.length >= 1, "terminates on a cyclic schema and still finds rarity");

const found5 = [];
extendRarityChoices({ fields: { traits: { fields: { rarity: { choices: () => ({}) } } } } }, EXTRA, found5, "");
assert.deepStrictEqual(found5, [], "non-array choices skipped, not crashed");

console.log("rarity-choices: all 5 assertions passed");
