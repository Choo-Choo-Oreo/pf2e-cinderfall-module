const MODULE_ID = "pf2e-cinderfall-module";
const TAB_KEY = "cinderfall-body";
const FLAG_SCOPE = MODULE_ID;
const FLAG_KEY = "installed";

/**
 * Crude v1 body slot tracker, added to the PF2e character sheet.
 *
 * Called "Body" rather than "Augmentations" because bio-augmentation,
 * cybernetic augmentation, and mutations all attach to the same underlying
 * body-slot data -- none of them own the tab more than the others do.
 *
 * Slots aren't hardcoded -- they're summed from flags.cinderfall.bodyParts /
 * bodyWhole / inlays.capacity across every item on the actor that carries
 * one (today that's just the Human ancestry; a future heritage/background/
 * feat can add its own flags.cinderfall block -- e.g. a bonus hand slot from
 * a cybernetic third arm -- and it shows up here with no code change).
 * PF2e has no rule element for inventing a new labeled feat-slot group on
 * the real Feats tab (confirmed against foundryvtt/pf2e's own rule-element
 * wiki), so this is its own tab instead, not a piggyback on Feats.
 *
 * Each slot is a plain text field, saved to the actor flag
 * `flags["pf2e-cinderfall-module"].installed`, keyed by a stable slot id
 * ("bodyParts:eyes:0", "bodyWhole:skeleton:0", "inlays:capacity:2", ...).
 * No drag-and-drop, no capacity validation yet -- just a place to write
 * what's installed (bio, cyber, or mutation) and see the slot count change
 * as items grant more.
 */

function collectSlots(actor) {
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

  const slots = [];
  for (const [key, count] of Object.entries(bodyParts)) {
    for (let i = 0; i < count; i++) {
      slots.push({ id: `bodyParts:${key}:${i}`, label: `${capitalize(key)} ${count > 1 ? i + 1 : ""}`.trim(), group: "Body Parts" });
    }
  }
  for (const [key, count] of Object.entries(bodyWhole)) {
    for (let i = 0; i < count; i++) {
      slots.push({ id: `bodyWhole:${key}:${i}`, label: `${capitalize(key)} ${count > 1 ? i + 1 : ""}`.trim(), group: "Body Systems" });
    }
  }
  for (let i = 0; i < inlays; i++) {
    slots.push({ id: `inlays:capacity:${i}`, label: `Inlay ${i + 1}`, group: "Inlays" });
  }
  return slots;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildPanelHTML(actor, slots) {
  const installed = actor.getFlag(FLAG_SCOPE, FLAG_KEY) ?? {};
  if (!slots.length) {
    return `<section class="tab cinderfall-body-panel" data-tab="${TAB_KEY}" style="display:none">
      <p class="notes">No body slots yet -- this actor has no ancestry/item carrying a
      <code>flags.cinderfall</code> body block.</p>
    </section>`;
  }

  const groups = new Map();
  for (const slot of slots) {
    if (!groups.has(slot.group)) groups.set(slot.group, []);
    groups.get(slot.group).push(slot);
  }

  let body = "";
  for (const [group, groupSlots] of groups) {
    body += `<h3>${group}</h3><div class="cinderfall-slot-grid">`;
    for (const slot of groupSlots) {
      const value = installed[slot.id] ?? "";
      body += `<label class="cinderfall-slot">
        <span>${slot.label}</span>
        <input type="text" data-slot-id="${slot.id}" value="${foundry.utils.escapeHTML(value)}" placeholder="empty">
      </label>`;
    }
    body += `</div>`;
  }

  return `<section class="tab cinderfall-body-panel" data-tab="${TAB_KEY}" style="display:none">
    <p class="notes">Crude v1 -- free-text slots, no drag-and-drop yet. Bio-augmentations,
    cybernetics, and mutations all go here; slot counts come from <code>flags.cinderfall</code>
    on this actor's items (ancestry, and later heritages/backgrounds/feats).</p>
    ${body}
  </section>`;
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

  const nav = root.querySelector("nav.sheet-tabs, .sheet-navigation nav, nav[data-group='sheet'], nav.tabs");
  const content = root.querySelector(".sheet-content, .sheet-body, section.sheet-body");
  if (!nav || !content) {
    console.warn(`${MODULE_ID} | body tab: couldn't find sheet nav/content, skipping injection`);
    return;
  }

  // Avoid duplicate injection on re-render.
  nav.querySelector(`[data-tab="${TAB_KEY}"]`)?.remove();
  content.querySelector(`[data-tab="${TAB_KEY}"]`)?.remove();

  const actor = app.actor ?? app.document;
  const slots = collectSlots(actor);

  const link = document.createElement("a");
  link.className = "item cinderfall-body-tab";
  link.dataset.tab = TAB_KEY;
  link.innerHTML = `<i class="fa-solid fa-dna"></i> Body`;
  nav.appendChild(link);

  content.insertAdjacentHTML("beforeend", buildPanelHTML(actor, slots));
  const panel = content.querySelector(`[data-tab="${TAB_KEY}"]`);

  link.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    for (const tab of content.querySelectorAll("[data-tab]")) {
      tab.style.display = tab === panel ? "block" : "none";
    }
    for (const navLink of nav.querySelectorAll("[data-tab]")) {
      navLink.classList.toggle("active", navLink === link);
    }
  });

  // Any native tab click should hide our panel again (native code doesn't know about it).
  nav.addEventListener("click", (ev) => {
    if (ev.target.closest(`[data-tab="${TAB_KEY}"]`)) return;
    panel.style.display = "none";
    link.classList.remove("active");
  });

  panel.querySelectorAll("input[data-slot-id]").forEach((input) => {
    input.addEventListener("change", async (ev) => {
      const installed = foundry.utils.deepClone(actor.getFlag(FLAG_SCOPE, FLAG_KEY) ?? {});
      const slotId = ev.target.dataset.slotId;
      if (ev.target.value.trim()) installed[slotId] = ev.target.value.trim();
      else delete installed[slotId];
      await actor.setFlag(FLAG_SCOPE, FLAG_KEY, installed);
    });
  });
}
