/**
 * `computeBaseContentPacks` in scripts/main.js -- the pure function behind
 * "hide base PF2e content by default". It never touches `game.*`; it only
 * transforms the pf2e `compendiumBrowserPacks` setting shape given what this
 * module forced last time and whether the toggle is currently on. See that
 * function's docstring in scripts/main.js for the full mechanism trace.
 *
 * The function is EXTRACTED from main.js at run time rather than duplicated
 * here, so this tests the shipped code and cannot drift from it.
 *
 * What it would have caught:
 *   - hiding overwriting a GM's own unrelated pf2e-pack choice instead of
 *     leaving it alone.
 *   - turning the toggle off failing to hand back a pack this module hid,
 *     or wrongly handing back one a GM hid independently.
 *   - a hide pass silently skipping a pack already `load: false` for some
 *     other reason, instead of still recording it as ours.
 *   - mutating the `current` object passed in (this module reads that value
 *     straight out of `game.settings.get`, which callers should be able to
 *     treat as read-only).
 *
 * Run: node tests/base-content.test.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "scripts", "main.js"), "utf8");
const i = src.indexOf("function computeBaseContentPacks");
assert.ok(i >= 0, "computeBaseContentPacks not found in scripts/main.js");
let depth = 0, end = -1;
for (let k = src.indexOf("{", i); k < src.length; k++) {
  if (src[k] === "{") depth++;
  else if (src[k] === "}" && --depth === 0) { end = k + 1; break; }
}
assert.ok(end > 0, "could not brace-match computeBaseContentPacks");
const tmp = join(mkdtempSync(join(tmpdir(), "cinderfall-")), "fn.mjs");
writeFileSync(tmp, "export " + src.slice(i, end) + "\n");
const { computeBaseContentPacks } = await import(pathToFileURL(tmp).href);

const PAIRS = [
  { tab: "feat", collection: "pf2e.feats-srd" },
  { tab: "equipment", collection: "pf2e.equipment-srd" },
];

// 1. Hiding forces every pair to load:false and stamps every one, even a
//    pack with no prior entry at all.
{
  const { next, nextStamp } = computeBaseContentPacks({}, {}, true, PAIRS);
  assert.equal(next.feat["pf2e.feats-srd"].load, false);
  assert.equal(next.equipment["pf2e.equipment-srd"].load, false);
  assert.deepEqual(nextStamp.feat, ["pf2e.feats-srd"]);
  assert.deepEqual(nextStamp.equipment, ["pf2e.equipment-srd"]);
}

// 2. Hiding preserves other fields already on an entry (name/package are
//    pf2e's own and this module never needs to know their shape).
{
  const current = { feat: { "pf2e.feats-srd": { load: true, name: "Feats", package: "pf2e" } } };
  const { next } = computeBaseContentPacks(current, {}, true, PAIRS);
  assert.deepEqual(next.feat["pf2e.feats-srd"], { load: false, name: "Feats", package: "pf2e" });
}

// 3. Turning off hands back only pairs this module stamped -- a GM's own
//    independent hide of an unrelated pf2e pack, in the same tab, survives.
{
  const current = {
    feat: {
      "pf2e.feats-srd": { load: false },       // ours last time
      "pf2e.actionspf2e": { load: false },     // GM's own choice, never ours
    },
  };
  const stamp = { feat: ["pf2e.feats-srd"] };
  const { next, nextStamp } = computeBaseContentPacks(current, stamp, false, PAIRS);
  assert.ok(!("pf2e.feats-srd" in next.feat), "our own pack was handed back");
  assert.equal(next.feat["pf2e.actionspf2e"].load, false, "GM's own hide must survive turning the toggle off");
  assert.deepEqual(nextStamp, {}, "stamp clears once everything is handed back");
}

// 4. Turning off with nothing stamped changes nothing.
{
  const current = { feat: { "pf2e.feats-srd": { load: true } } };
  const { next } = computeBaseContentPacks(current, {}, false, PAIRS);
  assert.deepEqual(next, current);
}

// 5. `current` is never mutated in place.
{
  const current = { feat: { "pf2e.feats-srd": { load: true } } };
  const frozen = JSON.parse(JSON.stringify(current));
  computeBaseContentPacks(current, {}, true, PAIRS);
  assert.deepEqual(current, frozen, "input object must not be mutated");
}

console.log("base-content: 5/5 checks passed");
