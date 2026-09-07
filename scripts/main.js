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
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready`);
});
