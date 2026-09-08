const MODULE_ID = "pf2e-cinderfall-module";

/**
 * Ancestries and ancestry features ship as compiled compendium packs
 * (see module.json "packs"), built from packs-source/**.json by
 * tools/foundry/build_pack.py in the Cinderfall site repo. Nothing is
 * created at runtime any more -- a world Item created here would shadow
 * the compendium copy and break the Compendium.* UUIDs that ancestries
 * use to grant their features.
 */
Hooks.once("init", () => {
  console.log(`${MODULE_ID} | initializing`);
  // Stores the languageRarities map this module last wrote, so the ready hook
  // below can tell "the shipped map changed" from "the GM re-tiered by hand".
  game.settings.register(MODULE_ID, "languageRarityStamp", {
    scope: "world",
    config: false,
    type: String,
    default: "",
  });
  // Same idea for the Item Piles currency write below: stamp what we wrote so a
  // GM's hand-edit to a currency survives, and only a shipped change writes again.
  game.settings.register(MODULE_ID, "itemPilesCurrencyStamp", {
    scope: "world",
    config: false,
    type: String,
    default: "",
  });
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready`);
});

/**
 * Cinderfall item rarity tiers.
 *
 * The site authors eight tiers as `cc-tier-*` classes on the card pages --
 * common, uncommon, rare, epic, legendary, mythic, exotic, unique -- while
 * PF2e ships four. Registering them takes TWO separate things, because the
 * label and the stored value are separate gates:
 *
 *  1. CONFIG.PF2E.rarityTraits -- the label. Every sheet, chat card and the
 *     compendium browser filter reads this record and nothing else
 *     (item/base/sheet/sheet.ts:161, item/physical/document.ts:782,
 *     tabs/base.svelte.ts:274). CONFIG.PF2E is a plain object, never frozen.
 *  2. `choices` on every rarity field -- the stored value. A schema-backed
 *     document validates against PF2e's frozen RARITIES via RarityField
 *     (module/model.ts:7). Without this, a tier shows in the dropdown and
 *     then fails to save: "rarity: <tier> is not a valid choice".
 *
 * TIMING IS LOAD-BEARING, and getting it wrong is silent. Foundry's order is
 * init -> initializePacks -> initializeDocuments -> setup -> ready, so every
 * world document AND every compendium document is constructed and validated
 * BEFORE `setup` runs. Doing this on `setup` (as this module did until
 * 2026-09-07) widens the ladder in time for later edits but not in time for
 * load: existing documents at a Cinderfall tier get flagged in Support &
 * Issues > Document Issues on every boot, while new edits appear to work
 * fine. That asymmetry is what makes it easy to miss.
 *
 * So this runs on `init`. CONFIG.Item/Actor.dataModels are assigned at script
 * evaluation time (scripts/hooks/load.ts:63, "not an actual hook listener"),
 * which is before any hook, so the schemas are always reachable here. But
 * CONFIG.PF2E is assigned in PF2e's own `init` listener (hooks/init.ts:33),
 * and listener order between a system and a module is not guaranteed -- so
 * the label half falls back to a `setup` catch-up if it was not ready yet.
 * Both halves are idempotent.
 */
function applyRarityTiers(phase) {
  const tiers = game.modules.get(MODULE_ID)?.flags?.[MODULE_ID]?.rarityTiers;
  if (!tiers) return;
  const extra = Object.keys(tiers);

  // 1. Labels -- only possible once PF2e has populated CONFIG.PF2E.
  if (CONFIG.PF2E?.rarityTraits) {
    const missing = extra.filter((t) => !(t in CONFIG.PF2E.rarityTraits));
    if (missing.length) {
      Object.assign(CONFIG.PF2E.rarityTraits, tiers);
      console.log(`${MODULE_ID} | registered rarity tiers on ${phase}`, extra);
    }
  } else if (phase === "setup") {
    console.warn(`${MODULE_ID} | CONFIG.PF2E.rarityTraits absent at setup; labels not registered`);
  }

  // 2. Validation choices. RARITIES is Object.freeze'd, so the array is
  //    REPLACED, never pushed to.
  const patched = [];
  for (const [group, cfg] of [["Item", CONFIG.Item], ["Actor", CONFIG.Actor]]) {
    for (const [docType, cls] of Object.entries(cfg?.dataModels ?? {})) {
      try {
        extendRarityChoices(cls.schema, extra, patched, `${group}.${docType}.`);
      } catch (err) {
        console.warn(`${MODULE_ID} | rarity choices not extended on ${group}.${docType}`, err);
      }
    }
  }
  if (patched.length) {
    console.log(`${MODULE_ID} | extended rarity choices on ${patched.length} field(s) at ${phase}`, patched);
  }
}

Hooks.once("init", () => applyRarityTiers("init"));
Hooks.once("setup", () => applyRarityTiers("setup"));

function extendRarityChoices(schema, extra, found, path = "", depth = 0) {
  if (!schema?.fields || depth > 6) return;
  for (const [key, field] of Object.entries(schema.fields)) {
    if (key === "rarity" && Array.isArray(field.choices)) {
      const missing = extra.filter((t) => !field.choices.includes(t));
      if (missing.length) {
        field.choices = [...field.choices, ...missing];
        found.push(`${path}${key}`);
      }
    } else if (field?.fields) {
      extendRarityChoices(field, extra, found, `${path}${key}.`, depth + 1);
    }
  }
}

/**
 * Language rarity.
 *
 * PF2e has no language Item, so a language's rarity cannot ride along in a
 * compendium document the way equipment rarity rides in system.traits.rarity.
 * It lives in one world setting -- game.settings.get("pf2e",
 * "homebrew.languageRarities") -- a DataModel of { commonLanguage, uncommon,
 * rare, secret, unavailable }. Anything in none of those sets is common.
 *
 * The tiers are AUTHORED on languages.html as cc-tier-* classes, mirrored into
 * each languages card as `rarity`, and emitted here from
 * module.json flags.pf2e-cinderfall-module.languageRarities. build_pack.py
 * fails the build if the manifest and the cards disagree, so this map is never
 * hand-edited.
 *
 * NOT hardcoded, deliberately: the language ladder is a separate frozen list,
 * ["common","uncommon","rare","secret"] (creature/values.ts:296), and the
 * homebrew.languageRarities DataModel only has fields for those tiers -- so a
 * Cinderfall-named LANGUAGE tier genuinely has nowhere to go and Echo-Tongue's
 * cc-tier-exotic still maps down to `secret`. That is a narrower claim than the
 * one this comment used to make; item rarity is a different mechanism and is
 * handled by the setup hook below. See README.
 *
 * Applied once per map, not once per load: we stamp what we wrote, so a GM who
 * re-tiers a language by hand keeps their choice, while a genuine change to
 * the shipped map still lands.
 */
Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  const map = game.modules.get(MODULE_ID)?.flags?.[MODULE_ID]?.languageRarities;
  if (!map) return;

  const stamp = JSON.stringify(map);
  if (game.settings.get(MODULE_ID, "languageRarityStamp") === stamp) return;

  const setting = game.settings.get("pf2e", "homebrew.languageRarities");
  const next = typeof setting?.toObject === "function"
    ? setting.toObject()
    : foundry.utils.deepClone(setting);

  // What the GM has placed by hand is never moved. `prev` is the map we wrote
  // last time, so a language sitting in a tier we did not put it in was placed
  // by a person, and their choice wins -- on the FIRST run that is every tier
  // they have ever set, because prev is empty. Measured against cinder-fall
  // 2026-09-07: the GM had deliberately tiered 4 languages and left the rest
  // in `common`, which is the derived default rather than a ruling. Without
  // this guard the first load would have silently overwritten all four.
  let prev = {};
  try { prev = JSON.parse(game.settings.get(MODULE_ID, "languageRarityStamp") || "{}"); } catch { /* first run */ }
  const placedBy = (slug, m) => ["uncommon", "rare", "secret"].find((t) => (m[t] ?? []).includes(slug));

  const ours = new Set(["uncommon", "rare", "secret"].flatMap((t) => map[t] ?? []));
  const keep = new Set();  // slugs the GM owns; we leave them exactly where they are
  for (const slug of ours) {
    const here = placedBy(slug, next);
    if (here && here !== placedBy(slug, prev)) keep.add(slug);
  }

  for (const tier of ["uncommon", "rare", "secret", "unavailable"]) {
    const kept = Array.from(next[tier] ?? []).filter((s) => !ours.has(s) || keep.has(s));
    const add = (map[tier] ?? []).filter((s) => !keep.has(s));
    next[tier] = Array.from(new Set([...kept, ...add]));
  }
  if (map.commonLanguage && !next.commonLanguage) next.commonLanguage = map.commonLanguage;
  if (keep.size) console.log(`${MODULE_ID} | kept GM-set rarities:`, [...keep]);

  await game.settings.set("pf2e", "homebrew.languageRarities", next);
  await game.settings.set(MODULE_ID, "languageRarityStamp", stamp);
  console.log(`${MODULE_ID} | applied language rarities`, next);
});

/**
 * Item Piles currency integration.
 *
 * Two jobs, both on the Item Piles side only -- nothing here touches PF2e's
 * own money. See README "### Currency".
 *
 * 1. Relabel the four coins. `itempiles-pf2e/module.js` registers them with
 *    hardcoded names and `abbreviation: "{#}GP"` strings, which do NOT read
 *    PF2e's i18n, so the lang/en.json rename does not reach them.
 *
 * 2. Register the Butcher's Marks as SECONDARY currencies. Item Piles gives a
 *    secondary currency `totalCost: 0` and excludes it from the primary
 *    exchange math (see `getItemFlagPriceData` in item-piles.js), so it can be
 *    held, priced and spent while having no rate to credits. That is exactly
 *    what the setting says a mark is.
 *
 * Both live in world settings (`item-piles.currencies` /
 * `item-piles.secondaryCurrencies`) -- there is no API setter, only getters
 * over `getSetting(...)`. So this is a stamped one-shot in the same style as
 * the language-rarity pass above: a GM who edits a currency by hand keeps that
 * edit, and only a genuine change to the shipped map writes again.
 */
const CINDERFALL_COIN_LABELS = {
  "Platinum Pieces": { name: "Packet", abbreviation: "{#}pk" },
  "Gold Pieces": { name: "Credit", abbreviation: "{#}cr" },
  "Silver Pieces": { name: "Byte", abbreviation: "{#}by" },
  "Copper Pieces": { name: "Bit", abbreviation: "{#}bt" },
};

// exchangeRate is deliberately absent. A secondary currency that carries one
// is convertible, and "no posted rate" is the whole point of a mark.
//
// ONE denomination, by owner ruling 2026-09-07: "the Butcher's meant to have
// one static currency". The shipped set is Bit / Byte / Credit / Packet (the
// four coins above) plus Mark, and nothing else. A "Plate" worth 100 marks
// existed briefly and is archived at packs-source/equipment/_retired/plate.json
// -- a second denomination implies a rate between the two, which is the one
// thing a mark is not supposed to have.
const CINDERFALL_MARKS = [
  { item: "Mark", abbreviation: "{#}mk" },
];

// Secondary currencies this module registered in a past version and no longer
// ships. The stamp alone cannot retire one: it only gates whether the hook
// runs, and the hook only ever pushes. Without this, Plate would sit in the
// world's secondaryCurrencies forever, priced on every merchant sheet.
//
// Matched on name AND abbreviation, not on the uuid. The obvious guard -- only
// pull an entry pointing into our own compendium -- looked tighter and was
// wrong: the live world's entries pointed at WORLD items (Item.Lb3pogx...),
// left over from an earlier A/B test of where Item Piles will resolve a
// currency from, so a uuid guard would have retired nothing and said it had.
// name+abbreviation is the pair this module actually wrote, and a GM's own
// "Plate" under a different abbreviation survives it.
const CINDERFALL_RETIRED_MARKS = [
  { item: "Plate", abbreviation: "{#}pl" },
];

async function resolveEquipmentUuid(name) {
  const pack = game.packs.get(`${MODULE_ID}.equipment`);
  if (!pack) return null;
  // Resolved from the live index rather than hardcoded: build_pack.py assigns
  // the _id, so an id pinned here would silently rot on the next rebuild.
  const entry = (await pack.getIndex()).find((e) => e.name === name);
  return entry ? `Compendium.${MODULE_ID}.equipment.${entry._id}` : null;
}

Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  if (!game.modules.get("item-piles")?.active) return;
  if (game.system.id !== "pf2e") return;

  const stamp = JSON.stringify({ CINDERFALL_COIN_LABELS, CINDERFALL_MARKS, CINDERFALL_RETIRED_MARKS, v: 3 });
  if (game.settings.get(MODULE_ID, "itemPilesCurrencyStamp") === stamp) return;

  // --- 1. relabel the four coins -------------------------------------------
  const coins = foundry.utils.deepClone(game.settings.get("item-piles", "currencies") ?? []);
  if (!coins.length) {
    console.warn(`${MODULE_ID} | item-piles has no currencies yet; skipping relabel`);
    return;
  }
  const renamed = [];
  for (const c of coins) {
    const label = CINDERFALL_COIN_LABELS[c.name];
    if (!label) continue;             // already renamed, or a currency we do not own
    c.name = label.name;
    c.abbreviation = label.abbreviation;
    renamed.push(label.name);
  }

  // --- 2. register the Marks as secondary currencies ------------------------
  const secondary = foundry.utils.deepClone(
    game.settings.get("item-piles", "secondaryCurrencies") ?? [],
  );
  const added = [];
  const repointed = [];
  const retired = [];
  let incomplete = false;

  // Retire first, so a name that moved from shipped to retired cannot be both.
  for (const old of CINDERFALL_RETIRED_MARKS) {
    const i = secondary.findIndex((s) => s.name === old.item && s.abbreviation === old.abbreviation);
    if (i === -1) continue;
    secondary.splice(i, 1);
    retired.push(old.item);
  }

  for (const mark of CINDERFALL_MARKS) {
    const existing = secondary.find((s) => s.name === mark.item);
    const uuid = await resolveEquipmentUuid(mark.item);
    if (existing) {
      // An entry by this name is already registered. Leave a GM's own entry
      // alone, but repoint one whose uuid no longer resolves -- Item Piles
      // caches currencies by uuid (`getItemFromCache` reads COMPENDIUM_CACHE),
      // and an unresolvable uuid drops every price built on it with no error,
      // no warning, and an empty price string on the merchant sheet.
      if (uuid && existing.data?.uuid !== uuid && !(await fromUuid(existing.data?.uuid ?? ""))) {
        repointed.push(`${mark.item}: ${existing.data?.uuid} -> ${uuid}`);
        existing.data = { ...(existing.data ?? {}), uuid };
      }
      continue;
    }
    if (!uuid) {
      // Almost always "packs-source has it but build_pack.py has not run yet".
      // Do NOT stamp in this case -- see below.
      console.warn(`${MODULE_ID} | no "${mark.item}" in the equipment pack; not registered`);
      incomplete = true;
      continue;
    }
    const source = await fromUuid(uuid);
    secondary.push({
      type: "item",
      name: mark.item,
      img: source?.img ?? "icons/svg/coins.svg",
      abbreviation: mark.abbreviation,
      data: { uuid },
    });
    added.push(mark.item);
  }

  if (renamed.length) await game.settings.set("item-piles", "currencies", coins);
  if (added.length || repointed.length || retired.length) {
    await game.settings.set("item-piles", "secondaryCurrencies", secondary);
    if (retired.length) console.log(`${MODULE_ID} | retired currencies`, retired);
    if (repointed.length) console.log(`${MODULE_ID} | repointed stale currency uuids`, repointed);
  }

  // The stamp means "everything this module ships is registered", so a partial
  // run must not write it -- otherwise the next load early-returns and the
  // missing currency never registers, with the only trace a console warning
  // nobody reads. Measured 2026-09-07: the first live run stamped with zero
  // secondaries because the pack had not been built, and would have stayed
  // that way forever.
  if (incomplete) {
    console.warn(`${MODULE_ID} | item-piles registration incomplete; not stamping, will retry next load`);
  } else {
    await game.settings.set(MODULE_ID, "itemPilesCurrencyStamp", stamp);
  }
  console.log(`${MODULE_ID} | item-piles currencies -- renamed:`, renamed, "secondary:", added, "retired:", retired);
});

/**
 * Rename the coin ITEMS.
 *
 * The lang/en.json rename covers PF2E.Currency.* and PF2E.CurrencyAbbreviations.*
 * -- every price string in the game. It does NOT cover the four treasure items
 * in `pf2e.equipment-srd`, because a pack document's name is data, not an i18n
 * key. So an inventory still read "Gold Pieces" while every price beside it read
 * in credits. Caught by the owner on the first live look.
 *
 * Renaming these is safe, and that was checked rather than assumed:
 * `TreasurePF2e.unit` derives a coin's denomination from which key is set in
 * `price.value` (`pf2e.mjs`), `isCoinage` is `category === "coin"`, and the ONLY
 * place in pf2e.mjs that mentions the `gold-pieces`-style slugs is a category
 * dropdown gate in TreasureSheetPF2e. Nothing identifies a coin by its name.
 * Slugs are left untouched regardless -- they are what the system keys on.
 */
const CINDERFALL_COIN_ITEM_NAMES = {
  "platinum-pieces": "Packets",
  "gold-pieces": "Credits",
  "silver-pieces": "Bytes",
  "copper-pieces": "Bits",
};

// The compendium INDEX carries only a subset of fields and system.slug is not
// among it -- measured live 2026-09-07, an index-side slug match found 0 of 4.
// So the index patch keys on the pack ids instead, which are stable pf2e data
// (the same four `itempiles-pf2e` hardcodes in its own CURRENCIES array).
const CINDERFALL_COIN_PACK_IDS = {
  JuNPeK5Qm1w6wpb4: "Packets",
  B6B7tBWJSqOBz5zz: "Credits",
  "5Ew82vBF9YfaiY9f": "Bytes",
  lzJ8AVhRcbFul5fh: "Bits",
};

function cinderfallCoinName(doc) {
  const src = doc?._source ?? doc;
  if (src?.type !== "treasure") return null;
  const slug = src.system?.slug ?? doc?.slug;
  const renamed = CINDERFALL_COIN_ITEM_NAMES[slug];
  return renamed && src.name !== renamed ? renamed : null;
}

// Catches every coin that enters play: dragged from the compendium, looted,
// split from a party stash, granted by a merchant.
Hooks.on("preCreateItem", (doc) => {
  const name = cinderfallCoinName(doc);
  if (name) doc.updateSource({ name });
});

// One-shot for coins that were already sitting in the world before this shipped.
Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  if (game.system.id !== "pf2e") return;

  const fix = [];
  for (const item of game.items) {
    const name = cinderfallCoinName(item);
    if (name) fix.push(item.update({ name }));
  }
  for (const actor of game.actors) {
    const updates = [];
    for (const item of actor.items) {
      const name = cinderfallCoinName(item);
      if (name) updates.push({ _id: item.id, name });
    }
    if (updates.length) fix.push(actor.updateEmbeddedDocuments("Item", updates));
  }
  if (fix.length) {
    await Promise.all(fix);
    console.log(`${MODULE_ID} | renamed ${fix.length} existing coin stack(s)`);
  }

  // Best-effort: the compendium browser reads pack.index, which is built from
  // the pack on disk and cannot be written. Patching it in memory is what makes
  // the sidebar agree with the sheets. Guarded because it is not a documented
  // surface -- if a Foundry version rebuilds the index this simply stops working
  // and nothing else breaks.
  //
  // Two things this has to get right, both measured live 2026-09-07:
  //
  //  - `pack.index` is EMPTY at ready for a compendium nobody has opened yet.
  //    The first version patched it there and reported success having renamed
  //    nothing; the four coins read "Platinum Pieces" etc. on the next look.
  //    So: await getIndex() first, which is what actually populates it.
  //  - getIndex() REBUILDS the index from disk whenever it is called with
  //    fields it has not cached (pf2e's compendium browser does exactly this),
  //    which throws the rename away again. A one-shot patch cannot hold. So the
  //    method is wrapped and the rename re-applied after every rebuild.
  try {
    const pack = game.packs.get("pf2e.equipment-srd");
    if (pack) {
      const relabel = () => {
        let n = 0;
        for (const [id, renamed] of Object.entries(CINDERFALL_COIN_PACK_IDS)) {
          const entry = pack.index?.get(id);
          if (entry && entry.name !== renamed) { entry.name = renamed; n += 1; }
        }
        return n;
      };
      if (!pack[`${MODULE_ID}-indexPatched`]) {
        const original = pack.getIndex.bind(pack);
        pack.getIndex = async (...args) => { const index = await original(...args); relabel(); return index; };
        pack[`${MODULE_ID}-indexPatched`] = true;
      }
      await pack.getIndex();
      console.log(`${MODULE_ID} | coin entries relabelled in the pf2e compendium index; ${relabel()} still stale after`);
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | could not relabel the compendium index`, err);
  }
});

/**
 * Build the Item Piles price flag for an item sold in Marks.
 *
 * This exists because the shape has one non-obvious requirement that fails
 * silently, and it cost a full debugging pass to find. Measured 2026-09-07: the
 * three test items on the Butcher returned an empty price string with zero
 * entries, no error, no warning, with both currencies resolving correctly in
 * the Item Piles cache.
 *
 * The cause is `secondary: true`. `getItemFlagPriceData` in item-piles.js reads:
 *
 *     const isRegularCurrency = !price.secondary
 *       ? currencyList.find((c) => c.name === price.name && ...)
 *       : false;
 *     const totalCost = isRegularCurrency
 *       ? price.quantity * isRegularCurrency.exchangeRate : 0;
 *
 * Without the flag it looks the currency up, FINDS the mark (secondary
 * currencies are in `currencyList` too -- `getCurrencyList` concatenates them),
 * treats it as a regular currency, and multiplies by `exchangeRate`. A mark has
 * no exchangeRate, deliberately: that absence is what "no posted rate" means
 * mechanically. `36 * undefined` is NaN, `getPriceArray(NaN)` produces all-NaN
 * costs, and `.filter((p) => p.cost)` drops every one of them. Empty string.
 *
 * So the design decision and the bug are the same fact, and the only thing
 * separating them is this flag. Anything writing a mark price should come
 * through here rather than hand-rolling the object.
 *
 * @param {number} quantity  price in marks
 * @param {object} [options]
 * @param {boolean} [options.disableNormalCost=true]  marks-only, no credit price
 * @returns {Promise<object|null>} the `flags["item-piles"].item` payload, or
 *   null if the Mark item cannot be resolved (pack not built yet).
 */
async function cinderfallMarkPrice(quantity, { disableNormalCost = true } = {}) {
  const mark = CINDERFALL_MARKS[0];
  const uuid = await resolveEquipmentUuid(mark.item);
  if (!uuid) {
    console.warn(`${MODULE_ID} | cannot price in marks: no "${mark.item}" in the equipment pack`);
    return null;
  }
  const source = await fromUuid(uuid);
  return {
    disableNormalCost,
    prices: [[{
      type: "item",
      name: mark.item,
      img: source?.img ?? "icons/svg/coins.svg",
      abbreviation: mark.abbreviation,
      data: { uuid },
      quantity,
      fixed: true,       // a mark price ignores merchant buy/sell modifiers
      secondary: true,   // load-bearing -- see above
    }]],
  };
}

Hooks.once("ready", () => {
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = { ...(module.api ?? {}), cinderfallMarkPrice, CINDERFALL_MARKS };
});
