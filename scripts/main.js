const MODULE_ID = "pf2e-cinderfall-module";

/**
 * Every packs-source/*.json file that's ready to test. Add a path here
 * whenever tools/foundry/export_card.py produces a new one in the
 * Cinderfall site repo and it's synced into this module.
 */
const MANIFEST = [
  "packs-source/ancestries/ashwalkers.json",
  "packs-source/ancestries/cinderborn.json",
  "packs-source/ancestries/emberforged.json",
  "packs-source/ancestries/glassblood.json",
  "packs-source/ancestries/human.json",
  "packs-source/ancestries/hymnkin.json",
  "packs-source/ancestries/old-world-construct.json",
  "packs-source/ancestries/ratkin.json",
  "packs-source/ancestries/residuals.json",
  "packs-source/ancestries/vaultborn.json",
  "packs-source/ancestries/wire-wards.json",
  "packs-source/ancestry-features/a-body-of-fire.json",
  "packs-source/ancestry-features/a-fingerprint-not-a-coincidence.json",
  "packs-source/ancestry-features/a-parent-somewhere.json",
  "packs-source/ancestry-features/a-voice-recognized.json",
  "packs-source/ancestry-features/adaptable.json",
  "packs-source/ancestry-features/already-a-foothold.json",
  "packs-source/ancestry-features/ambient-glow.json",
  "packs-source/ancestry-features/an-escaped-tool.json",
  "packs-source/ancestry-features/banked-warmth.json",
  "packs-source/ancestry-features/bleed-through.json",
  "packs-source/ancestry-features/borrowed-instinct.json",
  "packs-source/ancestry-features/burn-pit-blood.json",
  "packs-source/ancestry-features/congenital-node.json",
  "packs-source/ancestry-features/darkvision.json",
  "packs-source/ancestry-features/fed-not-fed.json",
  "packs-source/ancestry-features/filtered-constitution.json",
  "packs-source/ancestry-features/full-diagnostic.json",
  "packs-source/ancestry-features/glass-sheen-skin.json",
  "packs-source/ancestry-features/hairline-cracks.json",
  "packs-source/ancestry-features/heat-surge.json",
  "packs-source/ancestry-features/iron-stomach.json",
  "packs-source/ancestry-features/plague-blood.json",
  "packs-source/ancestry-features/radiation-resistance.json",
  "packs-source/ancestry-features/raised-without-a-script.json",
  "packs-source/ancestry-features/scrap-sense.json",
  "packs-source/ancestry-features/structural-sense.json",
  "packs-source/ancestry-features/suppression-protocol.json",
  "packs-source/ancestry-features/synthetic-body.json",
  "packs-source/ancestry-features/the-hymn-underneath.json",
  "packs-source/ancestry-features/tunnel-dark-eyes.json",
  "packs-source/ancestry-features/vermins-constitution.json",
  "packs-source/ancestry-features/warren-bond.json",
  "packs-source/ancestry-features/warren-swift.json",
];

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | initializing`);
});

Hooks.once("ready", async () => {
  console.log(`${MODULE_ID} | ready`);
  if (!game.user.isGM) return;
  await syncPacksSource();
});

/**
 * Fetches this module's own bundled packs-source/*.json over the local
 * Foundry server and creates or updates plain World Items with it. Runs
 * automatically every time the world finishes loading with a GM present --
 * this is the module actually working, not a manual step. Re-running after
 * a source file changes updates the existing Item in place (matched by its
 * minted _id, via Foundry's own keepId create option) instead of
 * duplicating it.
 */
async function syncPacksSource() {
  let created = 0, updated = 0, failed = 0;

  for (const path of MANIFEST) {
    const url = `modules/${MODULE_ID}/${path}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch ${url} -> HTTP ${res.status}`);
      const data = await res.json();

      const existing = data._id ? game.items.get(data._id) : null;
      if (existing) {
        await existing.update(data);
        updated++;
        console.log(`${MODULE_ID} | sync: updated "${data.name}" (${data._id})`);
      } else {
        await Item.create(data, { keepId: true });
        created++;
        console.log(`${MODULE_ID} | sync: created "${data.name}" (${data._id ?? "no _id -- Foundry minted one"})`);
      }
    } catch (err) {
      failed++;
      console.error(`${MODULE_ID} | sync: ${path} failed`, err);
    }
  }

  if (created || updated || failed) {
    console.log(`${MODULE_ID} | packs-source sync: ${created} created, ${updated} updated, ${failed} failed`);
    if (failed) {
      ui.notifications.warn(`${MODULE_ID}: ${failed} item(s) failed to sync -- see console (F12).`);
    }
  }
}
