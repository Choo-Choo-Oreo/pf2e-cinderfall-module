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
 * NOT hardcoded, deliberately: pf2e's own ladder is frozen four wide
 * (Object.freeze(["common","uncommon","rare","unique"]) for items, and
 * ["common","uncommon","rare","secret"] for languages), so a fifth Cinderfall
 * tier is not registrable -- see README.
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
