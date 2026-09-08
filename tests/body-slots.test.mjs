/**
 * The body-slot contract: what the ancestries SUPPLY vs what the augments and
 * mutations DEMAND, and the bucketing in scripts/body-tab.js that has to join
 * the two.
 *
 * What it would have caught:
 *   - the live defect this file was written for. collectInstalled() read
 *     `flags.cinderfall.slot.category` and `.slot.key`, but the cards store
 *     `slot` as a VERBATIM page STRING ("Frame + Dermal + Viscera
 *     (Multi-Slot)"). Every bucket key came out "undefined:undefined", so all
 *     82 slotted mutations rendered as empty slots -- no error, no warning,
 *     nothing in the console. A render assertion is the only thing that sees
 *     it, which is why check 6 renders the panel and greps for the name.
 *   - a slot key drifting out of the Nine Slots on either side. Checks 7 and 8
 *     assert supply and demand are the same nine, both directions, so an
 *     ancestry renamed to "Circuitry" or a card slotted into "Torso" fails
 *     here instead of silently rendering an empty tab.
 *   - slotCost drifting away from slots.length (check 9).
 *   - the inlay key splitting in two. The cards say "Inlays"; this tab used to
 *     say "inlay". Check 4 pins them to one bucket, because two buckets that
 *     never meet is exactly the failure above wearing a different hat.
 *
 * Run: node tests/body-slots.test.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

// buildPanelHTML calls foundry.utils.escapeHTML at render time.
globalThis.foundry = {
  utils: {
    escapeHTML: (s) =>
      String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  },
};

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const { collectSlotCounts, collectInstalled, categoryForKey, slotBucketKey, buildPanelHTML } =
  await import("../scripts/body-tab.js");

const NINE = ["Ocular", "Neural", "Frame", "Dermal", "Arm", "Legs", "Viscera", "Circulatory", "Inlays"];

const readJSON = (p) => JSON.parse(readFileSync(p, "utf8"));
const packDir = (name) => join(root, "packs-source", name);
const packFiles = (name) => readdirSync(packDir(name)).filter((f) => f.endsWith(".json"));

// A stand-in for an ancestry item: only the flags matter to this code.
const ancestry = readJSON(join(packDir("ancestries"), "human.json"));
const supplyItem = { id: "anc", name: "Human", img: "", flags: { cinderfall: ancestry.flags.cinderfall } };

const item = (id, name, cf) => ({ id, name, img: "", flags: { cinderfall: cf } });
const actorOf = (...items) => ({ items: [supplyItem, ...items] });

let checks = 0;
const ok = (fn) => { fn(); checks += 1; };

// 1. The supply side is the Nine Slots, and inlays.capacity is a number.
ok(() => {
  const counts = collectSlotCounts(actorOf());
  const supplied = [...Object.keys(counts.bodyParts), ...Object.keys(counts.bodyWhole)];
  assert.deepEqual(supplied.sort(), NINE.filter((k) => k !== "Inlays").sort());
  assert.equal(counts.inlays, 3, "inlays.capacity must be read as a number, not a {Inlays: n} map");
});

// 2. THE REGRESSION. A card-shaped mutation (slot = string, slots = array)
//    must land in a real bucket, not "undefined:undefined".
ok(() => {
  const counts = collectSlotCounts(actorOf());
  const mut = item("m1", "Ashen Lung", { slot: "Viscera", slots: ["Viscera"], slotCost: 1 });
  const { byKey, unassigned } = collectInstalled(actorOf(mut), counts);
  assert.equal(unassigned.length, 0);
  assert.ok(!byKey.has("undefined:undefined"), "the string slot was read as an object again");
  assert.deepEqual(byKey.get(slotBucketKey("bodyWhole", "Viscera"))?.map((i) => i.id), ["m1"]);
});

// 3. A multi-slot item occupies one slot of EACH key -- 11 of these are real.
ok(() => {
  const counts = collectSlotCounts(actorOf());
  const mut = item("m2", "Apotheosis, Uninvited", {
    slot: "Frame + Dermal + Viscera (Multi-Slot)",
    slots: ["Frame", "Dermal", "Viscera"],
    slotCost: 3,
  });
  const { byKey } = collectInstalled(actorOf(mut), counts);
  for (const key of ["Frame", "Dermal", "Viscera"]) {
    assert.deepEqual(byKey.get(slotBucketKey("bodyWhole", key))?.map((i) => i.id), ["m2"], `missing from ${key}`);
  }
});

// 4. "Inlays" (cards) and "inlay" (this tab, pre-2026-09-08) are ONE bucket.
ok(() => {
  const counts = collectSlotCounts(actorOf());
  const card = item("i1", "Ledger Inlay", { slot: "Inlays", slots: ["Inlays"], slotCost: 1 });
  const legacy = item("i2", "Old Inlay", { slot: { category: "inlays", key: "inlay" } });
  const { byKey } = collectInstalled(actorOf(card, legacy), counts);
  assert.equal(byKey.size, 1, `expected one inlay bucket, got ${[...byKey.keys()].join(", ")}`);
  assert.deepEqual(byKey.get(slotBucketKey("inlays", "Inlays")).map((i) => i.id), ["i1", "i2"]);
});

// 5. Items with a slot line we cannot resolve are surfaced, never dropped.
ok(() => {
  const counts = collectSlotCounts(actorOf());
  const every = item("e1", "Total Rewrite", { slot: "Every slot" });
  const { byKey, unassigned } = collectInstalled(actorOf(every), counts);
  assert.equal(byKey.size, 0);
  assert.deepEqual(unassigned.map((i) => i.id), ["e1"]);
});

// 6. End to end: the rendered panel actually contains the item. This is the
//    assertion class the old bug slipped past -- bucketing can look fine in a
//    unit check and still render an empty slot.
ok(() => {
  const mut = item("m3", "Chitin Weave", { slot: "Dermal", slots: ["Dermal"], slotCost: 1 });
  const html = buildPanelHTML(actorOf(mut));
  assert.ok(html.includes("Chitin Weave"), "installed item is missing from the rendered panel");
  assert.ok(html.includes('data-item-id="m3"'));
  const multi = buildPanelHTML(actorOf(item("m4", "Apotheosis", {
    slot: "Frame + Dermal (Multi-Slot)", slots: ["Frame", "Dermal"], slotCost: 2,
  })));
  // Each row emits the id twice (edit link + delete link), so match the edit
  // link specifically -- one per row it occupies.
  const rows = multi.match(/data-action="edit-item" data-item-id="m4"/g) ?? [];
  assert.equal(rows.length, 2, "multi-slot item should fill both rows");
  assert.ok(multi.includes("&times;2"), "multi-slot marker missing");
});

// 7. SUPPLY: all 11 ancestries carry the same nine keys.
ok(() => {
  const files = packFiles("ancestries");
  assert.equal(files.length, 11, `expected 11 ancestries, found ${files.length}`);
  for (const f of files) {
    const cf = readJSON(join(packDir("ancestries"), f)).flags?.cinderfall ?? {};
    const keys = [...Object.keys(cf.bodyParts ?? {}), ...Object.keys(cf.bodyWhole ?? {})].sort();
    assert.deepEqual(keys, NINE.filter((k) => k !== "Inlays").sort(), `${f} does not supply the Nine Slots`);
    assert.equal(typeof cf.inlays?.capacity, "number", `${f}: inlays.capacity must stay a number`);
  }
});

// 8/9. DEMAND: every slotted card is the right shape, and every atomic key it
//      asks for is one of the nine. Zero unmatched, both directions.
ok(() => {
  const demanded = new Set();
  let slotted = 0;
  for (const dir of readdirSync(join(root, "packs-source"))) {
    for (const f of packFiles(dir)) {
      const cf = readJSON(join(packDir(dir), f)).flags?.cinderfall ?? {};
      if (!("slot" in cf) && !("slots" in cf)) continue;
      slotted += 1;
      const where = `${dir}/${f}`;
      assert.equal(typeof cf.slot, "string", `${where}: slot must stay the verbatim page string`);
      assert.ok(Array.isArray(cf.slots), `${where}: slots must be the atomic array`);
      assert.equal(cf.slotCost, cf.slots.length, `${where}: slotCost must equal slots.length`);
      for (const k of cf.slots) {
        assert.ok(NINE.includes(k), `${where}: "${k}" is not one of the Nine Slots`);
        demanded.add(k);
      }
    }
  }
  assert.ok(slotted > 0, "no slotted cards found -- did the pack layout move?");
  assert.deepEqual([...demanded].sort(), NINE.slice().sort(),
    "demand no longer covers exactly the Nine Slots");
  // Every demanded key resolves to a section that actually has rows.
  const counts = collectSlotCounts(actorOf());
  for (const k of demanded) {
    const cat = categoryForKey(k, counts);
    const has = cat === "inlays" ? counts.inlays > 0 : Object.keys(counts[cat]).includes(k);
    assert.ok(has, `"${k}" resolves to ${cat}, which supplies no such slot`);
  }
  console.log(`  ${slotted} slotted cards, ${demanded.size} distinct keys, 0 unmatched`);
});

// 10. A key the actor does not SUPPLY must not be bucketed into a row that
//     does not exist. Found live on a character whose embedded ancestry
//     predates the 2026-09-07 ruling and still spells it "circuitry": the item
//     bucketed cleanly and then rendered nowhere -- the same silent vanish,
//     one layer down.
ok(() => {
  const stale = {
    id: "old", name: "Ashwalkers (pre-ruling)", img: "",
    flags: { cinderfall: {
      bodyParts: { eyes: 2, heads: 1, hands: 2, torsos: 1, legs: 2 },
      bodyWhole: { skeleton: 1, neural: 1, circuitry: 1, dermal: 1, viscera: 1 },
      inlays: { capacity: 3 },
    } },
  };
  const clot = item("s1", "Slow-Clot", { slot: "Circulatory", slots: ["Circulatory"], slotCost: 1 });
  const actor = { items: [stale, clot] };
  const counts = collectSlotCounts(actor);
  const { unassigned } = collectInstalled(actor, counts);
  assert.deepEqual(unassigned.map((i) => i.id), ["s1"],
    "an unsupplied slot key must surface as Unassigned, not vanish into an empty bucket");
  assert.ok(buildPanelHTML(actor).includes("Slow-Clot"), "it must still be rendered somewhere");
});

// 11. Two spellings of one supplied key must not build two rows. Measured
//     live: an actor carrying both a pre-ruling and a current body block
//     supplied "dermal" and "Dermal", and a two-slot item rendered in three
//     rows -- the same item, twice, in what looks like two different slots.
ok(() => {
  const old = { id: "o", name: "old block", img: "", flags: { cinderfall: {
    bodyParts: { hands: 2 }, bodyWhole: { dermal: 1 }, inlays: { capacity: 3 } } } };
  const now = { id: "n", name: "new block", img: "", flags: { cinderfall: {
    bodyParts: { Arm: 1 }, bodyWhole: { Dermal: 1 }, inlays: { capacity: 0 } } } };
  const aug = item("b1", "Bough-Arm", {
    slot: "Arm + Dermal (Multi-Slot)", slots: ["Arm", "Dermal"], slotCost: 2 });
  const actor = { items: [old, now, aug] };
  const counts = collectSlotCounts(actor);
  assert.equal(Object.keys(counts.bodyWhole).length, 1,
    `"dermal" and "Dermal" must merge into one slot, got ${Object.keys(counts.bodyWhole).join(", ")}`);
  const rows = (buildPanelHTML(actor).match(/data-action="edit-item" data-item-id="b1"/g) ?? []).length;
  assert.equal(rows, 2, "a two-slot item must occupy exactly two rows");
});

console.log(`body slots: ${checks}/${checks} checks passed`);
