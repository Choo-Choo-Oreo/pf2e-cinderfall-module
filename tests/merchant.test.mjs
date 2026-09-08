/**
 * Shipped Item Piles merchants: the flags that fail SILENTLY.
 *
 * The Butcher is a compendium actor with his `flags.item-piles` merchant block
 * baked in, so importing him gives a working shop with no setup. Nothing in
 * Item Piles validates that block. Every failure below renders a plausible
 * shop that quietly does the wrong thing, which is exactly the kind of bug that
 * ships:
 *
 *   onlyAcceptBasePrice !== false   Sell-back falls through to the item's
 *                                   NORMAL cost. These items disable normal
 *                                   cost and have `price.value: {}`, so he
 *                                   would offer nothing for everything. The
 *                                   default is `true`, so omitting it breaks it.
 *   purchaseOptionsAsSellOption     getPriceData gates the item's own price
 *     !== true                      list on `merchant === seller ||
 *                                   purchaseOptionsAsSellOption && !buyer
 *                                   .onlyAcceptBasePrice`. Without it the sell
 *                                   quote is an EMPTY array, and the merchant
 *                                   sheet renders `prices[0]?.priceString` --
 *                                   the literal word "undefined" in the price
 *                                   column. This was a live bug on 2026-09-07.
 *   price.secondary !== true        getItemFlagPriceData does
 *                                   `!price.secondary ? currencyList.find(...)
 *                                   : false`, and getCurrencyList concatenates
 *                                   secondaries into that same list. Without
 *                                   the flag the mark is FOUND, treated as a
 *                                   regular currency, and multiplied by an
 *                                   absent exchangeRate -> NaN -> filtered
 *                                   away. Renders nothing, logs nothing.
 *   price.fixed !== false           `itemModifier = price.fixed ? 1 : modifier`.
 *                                   `true` pins the modifier to 1, so buyback
 *                                   pays the FULL asking price. This is the one
 *                                   that inverts the intent while looking right.
 *   infiniteQuantity !== true       Stock depletes. Intended to be endless.
 *
 * Also checks the price uuid is a Compendium uuid: a `RollTable.<id>` or
 * `Item.<id>` world uuid cannot resolve from a compendium actor in someone
 * else's world, and resolves to nothing rather than erroring.
 *
 * Run: node tests/merchant.test.mjs
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const npcDir = join(root, "packs-source", "npcs");

assert.ok(existsSync(npcDir), "packs-source/npcs is missing");
const files = readdirSync(npcDir).filter((f) => f.endsWith(".json"));
assert.ok(files.length > 0, "no npc sources found");

// The pack must be declared, or the build writes a LevelDB nobody reads.
const manifest = JSON.parse(readFileSync(join(root, "module.json"), "utf8"));
const pack = manifest.packs.find((p) => p.name === "npcs");
assert.ok(pack, "module.json declares no `npcs` pack");
assert.equal(pack.type, "Actor");
assert.equal(pack.path, "packs/npcs");

let merchants = 0;
let priced = 0;

for (const f of files) {
  const doc = JSON.parse(readFileSync(join(npcDir, f), "utf8"));
  const where = `packs-source/npcs/${f}`;
  const ip = doc.flags?.["item-piles"];
  if (!ip?.data || ip.data.type !== "merchant") continue;
  merchants += 1;

  assert.equal(ip.data.enabled, true, `${where}: pile is not enabled`);
  assert.equal(ip.data.onlyAcceptBasePrice, false,
    `${where}: onlyAcceptBasePrice must be false, or he offers nothing for everything`);
  assert.equal(ip.data.infiniteQuantity, true, `${where}: stock is meant to be endless`);
  // Item Piles stamps this on save; a block without it can be re-migrated.
  assert.match(String(ip.version ?? ""), /^\d+\.\d+/, `${where}: flags.item-piles.version missing`);

  // A world uuid in a shipped record resolves to nothing in anyone else's world.
  const asString = JSON.stringify(doc);
  for (const m of asString.matchAll(/"uuid":"((?:RollTable|Item|Actor|Scene)\.[^"]+)"/g)) {
    assert.fail(`${where}: world uuid "${m[1]}" cannot resolve from a compendium actor`);
  }
  assert.ok(!("tablesForPopulate" in ip.data),
    `${where}: tablesForPopulate points at a world RollTable; configure it per world`);

  for (const item of doc.items ?? []) {
    const f2 = item.flags?.["item-piles"]?.item;
    if (!f2?.prices) continue;
    priced += 1;
    const at = `${where} / "${item.name}"`;
    assert.equal(f2.purchaseOptionsAsSellOption, true,
      `${at}: without this the sell quote is empty and the sheet prints "undefined"`);
    for (const group of f2.prices) {
      for (const p of group) {
        assert.equal(p.secondary, true, `${at}: price.secondary must be true, or the price renders as nothing`);
        assert.equal(p.fixed, false, `${at}: price.fixed must be false, or buyback pays the full asking price`);
        assert.ok(p.abbreviation?.includes("{#}"), `${at}: abbreviation needs the {#} quantity placeholder`);
        assert.ok(p.data?.uuid?.startsWith("Compendium."),
          `${at}: price uuid must be a Compendium uuid, got ${p.data?.uuid}`);
        assert.ok(Number.isFinite(p.quantity) && p.quantity > 0, `${at}: price quantity must be a positive number`);
      }
    }
  }
}

assert.ok(merchants > 0, "no merchant NPCs found -- did the pack move?");
assert.ok(priced > 0, "the merchant has no priced stock");
console.log(`merchants: ${merchants} merchant(s), ${priced} priced item(s), all silent-failure checks passed`);
