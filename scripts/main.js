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
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready`);
});

/**
 * Cinderfall item rarity tiers.
 *
 * The site authors eight tiers as `cc-tier-*` classes on the card pages --
 * common, uncommon, rare, epic, legendary, mythic, exotic, unique -- while
 * PF2e ships four. The extra four are merged into CONFIG.PF2E.rarityTraits
 * from module.json flags so they render wherever PF2e reads that record:
 * item sheets (item/base/sheet/sheet.ts:161), chat-card traits
 * (item/physical/document.ts:782), and the compendium browser's rarity filter
 * (tabs/equipment.ts:149), which builds its checkboxes by mapping whatever
 * record it is handed (tabs/base.svelte.ts:274). CONFIG.PF2E is a plain
 * object and the system never freezes it.
 *
 * This registers the LABEL only. Whether a foreign value survives document
 * validation is a separate question -- RARITIES is frozen and used as
 * `choices` on RarityField (module/model.ts:7) -- and is measured against a
 * live world rather than asserted here. See README.
 *
 * Runs on `setup`, not `init`: PF2e populates CONFIG.PF2E during its own init
 * hook, and hook order between a system and a module is not guaranteed.
 */
Hooks.once("setup", () => {
  const tiers = game.modules.get(MODULE_ID)?.flags?.[MODULE_ID]?.rarityTiers;
  if (!tiers) return;
  if (!CONFIG.PF2E?.rarityTraits) {
    console.warn(`${MODULE_ID} | CONFIG.PF2E.rarityTraits absent; rarity tiers not registered`);
    return;
  }
  Object.assign(CONFIG.PF2E.rarityTraits, tiers);
  console.log(`${MODULE_ID} | registered rarity tiers`, Object.keys(tiers));

  // Labels alone are not enough. A schema-backed document validates rarity
  // against `choices` on its RarityField (pf2e module/model.ts:7), which is
  // PF2e's frozen RARITIES array -- so a sheet edit to a Cinderfall tier fails
  // with "rarity: <tier> is not a valid choice" even though the dropdown offers
  // it. Measured 2026-09-07 on pf2e 8.5.0 / Foundry 14.361.
  //
  // Note this only bites SOME types: in 8.5.0 only 10 item types and 6 actor
  // types are registered as DataModels (pf2e scripts/hooks/load.ts:102-122).
  // equipment, weapon and armor are NOT among them, so they carry no schema and
  // accept any string -- which is why an unvalidated write path stores junk
  // happily. Do not read that as "rarity is unvalidated"; it type-depends.
  //
  // RARITIES is Object.freeze'd, so the array is REPLACED, never pushed to.
  const extra = Object.keys(tiers);
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
  console.log(`${MODULE_ID} | extended rarity choices on ${patched.length} field(s)`, patched);
});

/**
 * Walk a SchemaField and widen the `choices` of every `rarity` StringField.
 *
 * Recurses because rarity sits at system.traits.rarity on items but is nested
 * differently on some actors; a name-and-shape match is more durable than a
 * hardcoded path. Depth-capped so a self-referential schema cannot hang setup.
 */
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
