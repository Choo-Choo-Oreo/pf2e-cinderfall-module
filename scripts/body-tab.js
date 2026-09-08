const MODULE_ID = "pf2e-cinderfall-module";
const TAB_KEY = "cinderfall-body";

/**
 * Crude v1 body slot tracker, added to the PF2e character sheet.
 *
 * Called "Body" rather than "Augmentations" because bio-augmentation,
 * cybernetic augmentation, and mutations all attach to the same underlying
 * body-slot data -- none of them owns the tab more than the others, and
 * all three are treated identically (same slot mechanic, no layering/
 * stacking multiple items into one slot).
 *
 * Slot COUNTS are summed from flags.cinderfall.bodyParts / bodyWhole /
 * inlays.capacity across every item on the actor that carries one. All 11
 * ancestries carry a block (verified 2026-09-07 against the built pack:
 * 11/11, each 8 parts / 5 systems / 3 inlays); a future heritage/background/
 * feat can add its own flags.cinderfall block and grow the list automatically.
 *
 * The "Nine Slots" are canon -- owner ruling 2026-09-07, and the ancestry
 * blocks were rewritten onto them (circuitry -> Circulatory, legs x2 -> one
 * paired Legs, heads/torsos -> unmappedBodyParts). Supply and demand agree:
 * the 11 ancestries supply exactly these nine and the augments/mutations
 * demand exactly these nine, with zero unmatched either way.
 *
 *   bodyParts   Ocular, Arm, Legs       affect one limb/organ. "Arm" is ONE
 *                                       slot covering both arms (GM ruling:
 *                                       augments balance per pair,
 *                                       floor(n/2)) -- not Arm-L / Arm-R.
 *   bodyWhole   Frame, Neural,          whole-body systems: acidic blood is
 *               Circulatory, Dermal,    a Viscera-wide effect, not an
 *               Viscera                 Ocular or Arm one.
 *   inlays      Inlays                  counted, not named. The supply side
 *                                       is flags.cinderfall.inlays.capacity,
 *                                       a number -- do NOT rename that key
 *                                       to {Inlays: n}; collectSlotCounts
 *                                       reads .capacity, and the rename
 *                                       would silently zero every character.
 *
 * What OCCUPIES a slot is a real embedded Item, tagged by the card data:
 *   flags.cinderfall.slot      the VERBATIM page string, NEVER parsed here.
 *                              Real values include "Arm - Left / Right",
 *                              "Frame + Dermal + Viscera (Multi-Slot)" and
 *                              "Every slot". tools/cards/check.py compares it
 *                              to the site page byte for byte, so it cannot
 *                              be reshaped into an object.
 *   flags.cinderfall.slots     the atomic array, e.g. ["Frame", "Dermal",
 *                              "Viscera"] -- THIS is what buckets an item.
 *   flags.cinderfall.slotCost  == slots.length.
 * An item with slots.length > 1 occupies one slot of EACH key listed, so it
 * shows up in each of those rows (11 such augments are real). Items this tab
 * creates write the same shape. The pre-2026-09-08 object shape
 * ({category, key}) is still read, so items created by an older build of this
 * tab keep working.
 * Works like feats: a player or GM adds one whenever they like (the "+" on
 * an empty slot creates a blank one and opens its sheet to fill in), and
 * removing one is the normal "delete item" action -- no custom install/
 * uninstall flow.
 *
 * PF2e has no rule element for inventing a new labeled feat-slot group on
 * the real Feats tab (confirmed against foundryvtt/pf2e's own rule-element
 * wiki), so this is its own tab, built directly against the real sheet
 * markup (templates/actors/character/sheet.hbs in the installed pf2e
 * system) rather than piggybacking on Feats.
 */

/**
 * Add a supplied slot to a bag, merging case-insensitively.
 *
 * Two spellings of one key ("dermal" from a pre-ruling embedded copy, "Dermal"
 * from a current one) would otherwise each build their own row, and since both
 * resolve to the same bucket, the SAME item renders in both -- measured live as
 * a two-slot item appearing in three rows. First spelling seen wins the label.
 */
function addSlot(bag, key, count) {
  const k = String(key).toLowerCase();
  const existing = Object.keys(bag).find((p) => p.toLowerCase() === k) ?? key;
  bag[existing] = (bag[existing] ?? 0) + Number(count || 0);
}

function collectSlotCounts(actor) {
  const bodyParts = {};
  const bodyWhole = {};
  let inlays = 0;

  for (const item of actor.items) {
    const cf = item.flags?.cinderfall;
    if (!cf) continue;
    for (const [key, count] of Object.entries(cf.bodyParts ?? {})) addSlot(bodyParts, key, count);
    for (const [key, count] of Object.entries(cf.bodyWhole ?? {})) addSlot(bodyWhole, key, count);
    inlays += Number(cf.inlays?.capacity || 0);
  }
  return { bodyParts, bodyWhole, inlays };
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Canonical bucket key. Case- and alias-insensitive, so the card data's
 * "Inlays" and this tab's own older "inlay" land in the same bucket instead
 * of splitting into two that never meet.
 */
const SLOT_ALIASES = { inlay: "inlays" };
function slotBucketKey(category, key) {
  const k = String(key ?? "").toLowerCase();
  return `${String(category ?? "").toLowerCase()}:${SLOT_ALIASES[k] ?? k}`;
}

/**
 * Which section a canonical slot key belongs to, derived from the SUPPLY side
 * so that adding a key to an ancestry needs no change here.
 */
function categoryForKey(key, counts) {
  const k = String(key ?? "").toLowerCase();
  if ((SLOT_ALIASES[k] ?? k) === "inlays") return "inlays";
  return Object.keys(counts.bodyParts).some((p) => p.toLowerCase() === k) ? "bodyParts" : "bodyWhole";
}

/**
 * Does this actor actually supply the slot a key names?
 *
 * Without this check, a key the actor does not supply still gets a bucket --
 * and a bucket with no row renders nothing. Measured on a live character whose
 * embedded ancestry predates the 2026-09-07 ruling and still carried the old
 * taxonomy (eyes/heads/hands/torsos/legs, skeleton/circuitry/...): "Slow-Clot"
 * bucketed cleanly into bodywhole:circulatory and then rendered in zero rows,
 * because the supply side spells it "circuitry". Same silent disappearance as
 * the bug this file was fixed for, one layer down.
 */
function isSupplied(key, counts) {
  const k = String(key ?? "").toLowerCase();
  if ((SLOT_ALIASES[k] ?? k) === "inlays") return counts.inlays > 0;
  return [...Object.keys(counts.bodyParts), ...Object.keys(counts.bodyWhole)]
    .some((p) => p.toLowerCase() === k);
}

/**
 * Items already installed in body slots, bucketed by slotBucketKey().
 *
 * Returns { byKey, unassigned }. `unassigned` is every item carrying a
 * cinderfall slot flag that could not be placed -- it gets rendered rather
 * than dropped. The version before 2026-09-08 read `slot.category` and
 * `slot.key` off what the cards actually store as a STRING, so every bucket
 * key was "undefined:undefined" and all 82 slotted mutations rendered as
 * empty slots, with no error logged anywhere.
 */
function collectInstalled(actor, counts) {
  const byKey = new Map();
  const unassigned = [];
  const push = (bucketKey, item) => {
    if (!byKey.has(bucketKey)) byKey.set(bucketKey, []);
    byKey.get(bucketKey).push(item);
  };

  for (const item of actor.items) {
    const cf = item.flags?.cinderfall;
    if (!cf) continue;
    const slot = cf.slot;

    // Legacy object shape, written by this tab before 2026-09-08.
    if (slot && typeof slot === "object" && slot.key) {
      push(slotBucketKey(slot.category ?? categoryForKey(slot.key, counts), slot.key), item);
      continue;
    }

    const keys = Array.isArray(cf.slots) ? cf.slots.filter(Boolean) : [];
    if (!keys.length) {
      // "Every slot", a trust-gated augment with no slot line, or a shape we
      // do not know yet. Surfaced, never silently swallowed.
      if (slot) unassigned.push(item);
      continue;
    }
    let placed = false;
    for (const key of new Set(keys)) {
      // A key this actor does not supply has no row to render into, so
      // bucketing it would hide the item. Fall through to Unassigned instead.
      if (!isSupplied(key, counts)) continue;
      push(slotBucketKey(categoryForKey(key, counts), key), item);
      placed = true;
    }
    if (!placed) unassigned.push(item);
  }
  return { byKey, unassigned };
}

function buildSlotRows(category, key, count, installed, { singular } = {}) {
  const items = installed.get(slotBucketKey(category, key)) ?? [];
  const rows = [];
  // Max, not count: an over-installed slot shows the surplus rather than
  // hiding it behind the supplied count.
  const total = Math.max(count, items.length);
  const name = singular ?? capitalize(key);
  for (let i = 0; i < total; i++) {
    rows.push({
      category, key, index: i,
      label: total > 1 ? `${name} ${i + 1}` : name,
      item: items[i] ?? null,
    });
  }
  return rows;
}

function rowHTML(row) {
  const cf = row.item?.flags?.cinderfall;
  const cost = Number(cf?.slotCost ?? (Array.isArray(cf?.slots) ? cf.slots.length : 1)) || 1;
  // A multi-slot item is listed in every slot it occupies; this marker is what
  // tells the player those rows are one item, not several.
  const multi = cost > 1
    ? `<span class="cinderfall-slot-multi" data-tooltip="${foundry.utils.escapeHTML(String(cf?.slot ?? ""))}">&times;${cost}</span>`
    : "";
  const body = row.item
    ? `<a class="cinderfall-slot-item" data-action="edit-item" data-item-id="${row.item.id}">
         <img src="${row.item.img}" width="20" height="20">
         ${foundry.utils.escapeHTML(row.item.name)}
       </a>${multi}
       <a class="cinderfall-slot-delete" data-action="delete-item" data-item-id="${row.item.id}" data-tooltip="Delete">
         <i class="fa-solid fa-trash"></i>
       </a>`
    : `<span class="cinderfall-slot-empty">empty</span>
       <a class="cinderfall-slot-add" data-action="add-item" data-category="${row.category}" data-key="${row.key}" data-tooltip="Add">
         <i class="fa-solid fa-plus"></i>
       </a>`;
  return `<li class="cinderfall-slot-row"><span class="cinderfall-slot-label">${row.label}</span>${body}</li>`;
}

function buildPanelHTML(actor) {
  const counts = collectSlotCounts(actor);
  const { bodyParts, bodyWhole, inlays } = counts;
  const { byKey: installed, unassigned } = collectInstalled(actor, counts);

  const section = (title, rows) =>
    rows.length ? `<h3>${title}</h3><ul class="cinderfall-slot-list">${rows.map(rowHTML).join("")}</ul>` : "";

  const bodyPartsRows = [];
  for (const [key, count] of Object.entries(bodyParts)) bodyPartsRows.push(...buildSlotRows("bodyParts", key, count, installed));

  const bodyWholeRows = [];
  for (const [key, count] of Object.entries(bodyWhole)) bodyWholeRows.push(...buildSlotRows("bodyWhole", key, count, installed));

  // Canonical key "Inlays" (what the cards demand), singular label for display.
  const inlayRows = buildSlotRows("inlays", "Inlays", inlays, installed, { singular: "Inlay" });

  // Anything carrying a slot flag we could not place. Rendered, not dropped.
  const unassignedRows = unassigned.map((item) => ({
    category: "unassigned",
    key: "unassigned",
    index: 0,
    label: String(item.flags?.cinderfall?.slot ?? "?"),
    item,
  }));

  const rowCount = bodyPartsRows.length + bodyWholeRows.length + inlayRows.length + unassignedRows.length;
  if (!rowCount) {
    return `<div class="tab cinderfall-body-panel" data-group="primary" data-tab="${TAB_KEY}">
      <p class="notes">No body slots yet -- this actor has no ancestry/item carrying a
      <code>flags.cinderfall</code> body block.</p>
    </div>`;
  }

  return `<div class="tab cinderfall-body-panel" data-group="primary" data-tab="${TAB_KEY}">
    <p class="notes">Crude v1 -- bio-augmentations, cybernetics, and mutations all go here, treated
    identically. "Body Parts" affect one limb/organ; "Body Systems" affect the whole body (e.g. acidic
    blood). An item marked &times;N fills one slot in each of N rows. Click a name to edit it, the
    trash to remove it, or + to add one.</p>
    ${section("Body Parts", bodyPartsRows)}
    ${section("Body Systems", bodyWholeRows)}
    ${section("Inlays", inlayRows)}
    ${unassignedRows.length ? `<h3>Unassigned</h3><p class="notes">These carry a slot line this tab
      could not resolve to a slot key -- e.g. "Every slot", or an augment with no slot line at all.
      Listed here so they are visible rather than lost.</p>
      <ul class="cinderfall-slot-list">${unassignedRows.map(rowHTML).join("")}</ul>` : ""}
  </div>`;
}

// Guarded so tests/body-slots.test.mjs can import the pure functions below
// under plain node, where there is no Hooks global.
if (typeof Hooks !== "undefined") {
  Hooks.on("renderCharacterSheetPF2e", (app, html) => {
    try {
      injectTab(app, html);
    } catch (err) {
      console.error(`${MODULE_ID} | body tab injection failed`, err);
    }
  });
}

function injectTab(app, html) {
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root) return;

  const nav = root.querySelector("nav.sheet-navigation");
  const content = root.querySelector("section.sheet-content");
  if (!nav || !content) {
    console.warn(`${MODULE_ID} | body tab: couldn't find nav.sheet-navigation / section.sheet-content, skipping`);
    return;
  }

  // Avoid duplicate injection on re-render.
  nav.querySelector(`[data-tab="${TAB_KEY}"]`)?.remove();
  content.querySelector(`[data-tab="${TAB_KEY}"]`)?.remove();

  const actor = app.actor ?? app.document;

  const link = document.createElement("a");
  link.className = "item";
  link.dataset.tab = TAB_KEY;
  link.dataset.group = "primary";
  link.dataset.tooltip = "Body";
  link.setAttribute("role", "tab");
  link.setAttribute("aria-label", "Body");
  link.innerHTML = `<i class="fa-solid fa-dna"></i>`;
  nav.querySelector(".manage-tabs")?.before(link) ?? nav.appendChild(link);

  content.insertAdjacentHTML("beforeend", buildPanelHTML(actor));
  const panel = content.querySelector(`[data-tab="${TAB_KEY}"]`);

  panel.addEventListener("click", async (ev) => {
    const target = ev.target.closest("[data-action]");
    if (!target) return;
    const { action, itemId, category, key } = target.dataset;

    if (action === "edit-item") {
      actor.items.get(itemId)?.sheet.render(true);
    } else if (action === "delete-item") {
      await actor.deleteEmbeddedDocuments("Item", [itemId]);
    } else if (action === "add-item") {
      const [created] = await actor.createEmbeddedDocuments("Item", [{
        name: "New Body Item",
        type: "equipment",
        system: { description: { value: "" } },
        // Same shape the card data uses, so tab-made and card-made items are
        // read by one code path. `category` is re-derived on read from the
        // supply side, so it is not stored.
        flags: { cinderfall: { slot: key, slots: [key], slotCost: 1 } },
      }]);
      created?.sheet.render(true);
    }
  });
}

export { collectSlotCounts, collectInstalled, categoryForKey, slotBucketKey, buildSlotRows, buildPanelHTML };
