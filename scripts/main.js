const MODULE_ID = "pf2e-cinderfall-module";

/**
 * Every packs-source/*.json file that's ready to test. Add a path here
 * whenever tools/foundry/export_card.py produces a new one in the
 * Cinderfall site repo and it's synced into this module.
 */
const MANIFEST = [
  "packs-source/ancestries/human.json",
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
