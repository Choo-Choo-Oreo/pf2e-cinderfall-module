/**
 * The Butcher's Marks: the one currency in the shipped set that is NOT a pf2e
 * coin. It rides on Item Piles' secondary-currency mechanism, which means the
 * failure modes live in three places at once -- scripts/main.js (what gets
 * registered), packs-source/equipment (the item behind it), and the world
 * setting it writes. This covers the two that are files.
 *
 * What it would have caught:
 *   - a second denomination sneaking back in. Owner ruling 2026-09-07 is ONE
 *     static currency; two denominations imply a rate between them, which is
 *     the one property a mark must not have.
 *   - `category: "coin"`. A coin-category treasure dropped on an actor is
 *     DELETED by pf2e and folded into the coin pool (TreasurePF2e.isCoinage,
 *     pf2e.mjs: `get isCoinage() { return this.system.category === "coin" }`).
 *     The Mark would vanish on pickup, silently.
 *   - non-zero bulk. Marks are pocket money and get held in the hundreds;
 *     bulk 1 each made a 500-mark purse weigh 500 Bulk. pf2e's own coins are
 *     exempt via isCoinage, which a material-category treasure never gets.
 *   - a shipped name also listed as retired, which would register it and then
 *     immediately pull it back out.
 *
 * Run: node tests/marks.test.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const main = readFileSync(join(root, "scripts", "main.js"), "utf8");

// Parse the two lists out of main.js rather than duplicating them here, so the
// test tracks the module instead of drifting alongside it.
function arrayLiteral(name) {
  const start = main.indexOf(`const ${name} = [`);
  assert.ok(start !== -1, `${name} not found in scripts/main.js`);
  const open = main.indexOf("[", start);
  const close = main.indexOf("];", open);
  assert.ok(close !== -1, `${name} literal is not closed`);
  return main.slice(open + 1, close);
}
const marksSrc = arrayLiteral("CINDERFALL_MARKS");
const marks = [...marksSrc.matchAll(/item:\s*"([^"]+)"[^}]*abbreviation:\s*"([^"]+)"/g)]
  .map(([, item, abbreviation]) => ({ item, abbreviation }));
const retired = [...arrayLiteral("CINDERFALL_RETIRED_MARKS").matchAll(/item:\s*"([^"]+)"/g)].map((m) => m[1]);

// 1. Exactly one mark denomination. This is the owner ruling, in a test.
assert.equal(marks.length, 1, `expected 1 mark denomination, got ${marks.length}: ${marks.map((m) => m.item).join(", ")}`);
assert.equal(marks[0].item, "Mark");
assert.equal(marks[0].abbreviation, "{#}mk");

// 2. Every abbreviation carries the {#} quantity placeholder. Item Piles builds
//    its price string with abbreviation.replace("{#}", cost) -- an abbreviation
//    without it renders a constant, with no error anywhere.
for (const m of marks) {
  assert.ok(m.abbreviation.includes("{#}"), `${m.item} abbreviation has no {#} placeholder`);
}

// 3. No mark collides with a coin abbreviation.
const lang = JSON.parse(readFileSync(join(root, "lang", "en.json"), "utf8"));
const coinAbbrs = ["pp", "gp", "sp", "cp"].map((d) => lang[`PF2E.CurrencyAbbreviations.${d}`]);
for (const m of marks) {
  const bare = m.abbreviation.replace("{#}", "");
  assert.ok(!coinAbbrs.includes(bare), `mark abbreviation "${bare}" collides with a coin`);
}

// 4. Shipped and retired are disjoint.
for (const m of marks) {
  assert.ok(!retired.includes(m.item), `"${m.item}" is both shipped and retired`);
}

// 5. Every shipped mark has a buildable source item, and every retired one does
//    not. build_pack.py globs packs-source/<owner>/*.json non-recursively, so a
//    file under _retired/ is present in the repo but absent from the pack.
const equip = join(root, "packs-source", "equipment");
const built = new Set(
  readdirSync(equip).filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(equip, f), "utf8")).name),
);
for (const m of marks) {
  assert.ok(built.has(m.item), `no packs-source/equipment/*.json defines "${m.item}"`);
}
for (const name of retired) {
  assert.ok(!built.has(name), `retired currency "${name}" is still built into the equipment pack`);
}

// 6. The Mark item itself: not coinage, and weightless.
const mark = JSON.parse(readFileSync(join(equip, "mark.json"), "utf8"));
assert.equal(mark.name, "Mark");
assert.equal(mark.type, "treasure");
assert.notEqual(mark.system.category, "coin",
  'category "coin" makes pf2e delete the item on pickup and fold it into the coin pool');
assert.equal(mark.system.bulk.value, 0, "marks are carried in the hundreds; they must weigh nothing");
assert.deepEqual(mark.system.price.value, {},
  "a price in pf2e coin would give the mark the exchange rate it is not supposed to have");

console.log(`marks: 6/6 checks passed (${marks.length} shipped, ${retired.length} retired)`);
