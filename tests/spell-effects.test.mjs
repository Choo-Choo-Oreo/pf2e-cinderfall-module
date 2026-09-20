// Pure logic of scripts/spell-effects.js plus the data it depends on.
// The hook itself needs a live Foundry world (making-cards doc 11).
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildEffectIndex, actorsFor, effectContext } from "../scripts/spell-effects.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
const ok = (fn) => { fn(); n += 1; };

ok(() => {
  const idx = buildEffectIndex([
    { uuid: "E1", flags: { cinderfall: { effectOfUuid: "S1", landsOn: "target" } } },
    { uuid: "E2", flags: { cinderfall: { effectOfUuid: "S1" } } },
    { uuid: "E3", flags: { cinderfall: {} } },
    { uuid: "E4" },
  ]);
  assert.deepEqual(idx.get("S1"), [{ uuid: "E1", landsOn: "target" }, { uuid: "E2", landsOn: "self" }]);
  assert.equal(idx.size, 1, "rows without effectOfUuid must be ignored");
});
ok(() => {
  const me = { alliance: "party" }, friend = { alliance: "party" }, foe = { alliance: "opposition" };
  assert.deepEqual(actorsFor("self", me, [foe]), [me]);
  assert.deepEqual(actorsFor("target", me, [foe, friend]), [foe, friend]);
  assert.deepEqual(actorsFor("ally", me, [foe, friend]), [friend]);
  assert.deepEqual(actorsFor("enemy", me, [foe, friend]), [foe]);
  assert.deepEqual(actorsFor("nonsense", me, [foe]), []);
  assert.deepEqual(actorsFor("ally", { alliance: null }, [{ alliance: null }]), [], "no alliance is not an ally");
});
ok(() => {
  const c = effectContext({ caster: { uuid: "A" }, casterToken: { uuid: "TA" }, spell: { uuid: "I" },
    target: { uuid: "B" }, targetToken: null });
  assert.deepEqual(Object.keys(c).sort(), ["origin", "roll", "target"]);
  assert.deepEqual(Object.keys(c.origin).sort(), ["actor", "item", "rollOptions", "spellcasting", "token"]);
  assert.equal(c.target.token, null);
});

// Data: every effect that names an `effectOf` must name a card that exists in packs-source,
// and every effect must say where it lands. Control: a made-up id must be reported.
const ids = new Set();
const effects = [];
for (const d of readdirSync(join(root, "packs-source"))) {
  const dir = join(root, "packs-source", d);
  if (!statSync(dir).isDirectory()) continue;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    ids.add(`${d}.${f.slice(0, -5)}`);
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
    if (doc.type === "effect" && doc.flags?.cinderfall?.effectOf) effects.push([`${d}.${f}`, doc.flags.cinderfall]);
  }
}
const dangling = (list) => list.filter(([, cf]) => !ids.has(cf.effectOf)).map(([w]) => w);
ok(() => {
  assert.ok(effects.length > 0, "no linked effects found -- did the pack layout move?");
  assert.deepEqual(dangling(effects), [], "effects whose effectOf names no card");
  assert.deepEqual(dangling([["control", { effectOf: "no.such-card" }]]), ["control"], "control must fire");
  for (const [w, cf] of effects) {
    assert.ok(["self", "target", "ally", "enemy"].includes(cf.landsOn), `${w}: landsOn ${cf.landsOn}`);
  }
  console.log(`  ${effects.length} linked effects, 0 dangling`);
});
assert.ok(existsSync(join(root, "scripts/spell-effects.js")));
console.log(`spell-effects: ${n}/${n} checks passed`);
