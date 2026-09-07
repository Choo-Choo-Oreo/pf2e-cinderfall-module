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
 * NOTE 2026-09-07: these slot keys do NOT match the "Nine Slots" table the
 * bio-/cyber-augmentation pages author (Ocular, Neural, Frame, Dermal, Arm
 * L/R, Legs, Viscera, Circulatory). Known conflicts: circuitry vs
 * Circulatory, legs x2 here vs one paired Legs slot there, and heads/torsos
 * with no page equivalent. Unresolved -- do not convert augments onto slot
 * keys until the owner rules which taxonomy is canon.
 * "Body Parts" slots (eyes, hands, legs, ...) are for things that affect one
 * limb/organ; "Body Systems" slots (skeleton, neural, circuitry, dermal,
 * viscera) are for things that affect the whole body (e.g. acidic blood is
 * a viscera-wide effect, not an eyes/hands one) -- both come from the same
 * ancestry data, just different sub-keys.
 *
 * What OCCUPIES a slot is a real embedded Item (type "equipment"), tagged
 * `flags.cinderfall.slot = {category, key}` matching the slot it belongs to.
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

function collectSlotCounts(actor) {
  const bodyParts = {};
  const bodyWhole = {};
  let inlays = 0;

  for (const item of actor.items) {
    const cf = item.flags?.cinderfall;
    if (!cf) continue;
    for (const [key, count] of Object.entries(cf.bodyParts ?? {})) {
      bodyParts[key] = (bodyParts[key] ?? 0) + Number(count || 0);
    }
    for (const [key, count] of Object.entries(cf.bodyWhole ?? {})) {
      bodyWhole[key] = (bodyWhole[key] ?? 0) + Number(count || 0);
    }
    inlays += Number(cf.inlays?.capacity || 0);
  }
  return { bodyParts, bodyWhole, inlays };
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Items already installed in body slots, bucketed by "category:key". */
function collectInstalled(actor) {
  const byKey = new Map();
  for (const item of actor.items) {
    const slot = item.flags?.cinderfall?.slot;
    if (!slot) continue;
    const bucketKey = `${slot.category}:${slot.key}`;
    if (!byKey.has(bucketKey)) byKey.set(bucketKey, []);
    byKey.get(bucketKey).push(item);
  }
  return byKey;
}

function buildSlotRows(category, key, count, installed) {
  const items = installed.get(`${category}:${key}`) ?? [];
  const rows = [];
  const total = Math.max(count, items.length);
  for (let i = 0; i < total; i++) {
    const item = items[i] ?? null;
    const label = count > 1 ? `${capitalize(key)} ${i + 1}` : capitalize(key);
    rows.push({ category, key, index: i, label, item });
  }
  return rows;
}

function rowHTML(row) {
  const body = row.item
    ? `<a class="cinderfall-slot-item" data-action="edit-item" data-item-id="${row.item.id}">
         <img src="${row.item.img}" width="20" height="20">
         ${foundry.utils.escapeHTML(row.item.name)}
       </a>
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
  const { bodyParts, bodyWhole, inlays } = collectSlotCounts(actor);
  const installed = collectInstalled(actor);
  const hasAny = Object.keys(bodyParts).length || Object.keys(bodyWhole).length || inlays;

  if (!hasAny) {
    return `<div class="tab cinderfall-body-panel" data-group="primary" data-tab="${TAB_KEY}">
      <p class="notes">No body slots yet -- this actor has no ancestry/item carrying a
      <code>flags.cinderfall</code> body block.</p>
    </div>`;
  }

  const section = (title, rows) =>
    rows.length ? `<h3>${title}</h3><ul class="cinderfall-slot-list">${rows.map(rowHTML).join("")}</ul>` : "";

  let bodyPartsRows = [];
  for (const [key, count] of Object.entries(bodyParts)) bodyPartsRows.push(...buildSlotRows("bodyParts", key, count, installed));

  let bodyWholeRows = [];
  for (const [key, count] of Object.entries(bodyWhole)) bodyWholeRows.push(...buildSlotRows("bodyWhole", key, count, installed));

  const inlayRows = buildSlotRows("inlays", "inlay", inlays, installed);

  return `<div class="tab cinderfall-body-panel" data-group="primary" data-tab="${TAB_KEY}">
    <p class="notes">Crude v1 -- bio-augmentations, cybernetics, and mutations all go here, treated
    identically. "Body Parts" affect one limb/organ; "Body Systems" affect the whole body (e.g. acidic
    blood). Click a name to edit it, the trash to remove it, or + to add one.</p>
    ${section("Body Parts", bodyPartsRows)}
    ${section("Body Systems", bodyWholeRows)}
    ${section("Inlays", inlayRows)}
  </div>`;
}

Hooks.on("renderCharacterSheetPF2e", (app, html) => {
  try {
    injectTab(app, html);
  } catch (err) {
    console.error(`${MODULE_ID} | body tab injection failed`, err);
  }
});

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
        flags: { cinderfall: { slot: { category, key } } },
      }]);
      created?.sheet.render(true);
    }
  });
}
