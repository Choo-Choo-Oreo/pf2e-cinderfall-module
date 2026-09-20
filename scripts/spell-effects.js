const MODULE_ID = "pf2e-cinderfall-module";

/**
 * Apply a spell's effect record when the spell is cast.
 *
 * Data: an effect card carries flags.cinderfall.effectOf (the spell's card id)
 * and landsOn ("self" | "target" | "ally" | "enemy"). tools/foundry/build_pack.py
 * derives flags.cinderfall.effectOfUuid, the spell's compendium UUID, so nothing
 * here parses a card id. pf2e itself only applies a feat/action `selfEffect`
 * (pf2e-source/src/module/apps/sidebar/chat-log.ts #onClickApplyEffect); this
 * does the same thing for spells, using the same `system.context` shape.
 *
 * Untested in a live world -- see making-cards/11-test-register.md, S-SE tests.
 */

// pf2e-source/src/module/item/spell/values.ts: set on a message only when the
// spell was actually cast, not merely sent to chat.
const CAST_A_SPELL_OPTION = "origin:action:slug:cast-a-spell";

/** entries: pack index rows -> Map<spell compendium uuid, [{uuid, landsOn}]> */
export function buildEffectIndex(entries) {
  const index = new Map();
  for (const e of entries) {
    const cf = e.flags?.cinderfall;
    if (!cf?.effectOfUuid) continue;
    const list = index.get(cf.effectOfUuid) ?? [];
    list.push({ uuid: e.uuid, landsOn: cf.landsOn ?? "self" });
    index.set(cf.effectOfUuid, list);
  }
  return index;
}

/** Which actors an effect lands on. `targeted` is the caster's current targets. */
export function actorsFor(landsOn, caster, targeted) {
  if (landsOn === "self") return caster ? [caster] : [];
  if (landsOn === "target") return targeted;
  const sameSide = (a) => a.alliance != null && a.alliance === caster?.alliance;
  if (landsOn === "ally") return targeted.filter(sameSide);
  if (landsOn === "enemy") return targeted.filter((a) => !sameSide(a));
  return [];
}

/** The pf2e effect context, mirroring chat-log.ts #onClickApplyEffect. */
export function effectContext({ caster, casterToken, spell, target, targetToken }) {
  return {
    origin: {
      actor: caster.uuid,
      token: casterToken?.uuid ?? null,
      item: spell.uuid,
      spellcasting: null,
      rollOptions: spell.getOriginData?.().rollOptions ?? [],
    },
    target: { actor: target.uuid, token: targetToken?.uuid ?? null },
    roll: null,
  };
}

let effectIndex = new Map();

async function loadIndex() {
  const rows = [];
  for (const pack of game.packs) {
    if (pack.metadata.packageName !== MODULE_ID || pack.documentName !== "Item") continue;
    const idx = await pack.getIndex({
      fields: ["flags.cinderfall.effectOfUuid", "flags.cinderfall.landsOn"],
    });
    rows.push(...idx);
  }
  effectIndex = buildEffectIndex(rows);
  console.log(`${MODULE_ID} | spell effects: ${effectIndex.size} spell(s) with a linked effect`);
}

async function applyFor(message) {
  const origin = message.flags?.pf2e?.origin;
  if (!origin?.rollOptions?.includes(CAST_A_SPELL_OPTION)) return;
  const spell = message.item;
  if (!spell?.isOfType?.("spell")) return;
  const links = effectIndex.get(spell.sourceId ?? spell._stats?.compendiumSource);
  if (!links?.length) return;

  const caster = message.actor;
  if (!caster) return;
  const casterToken = message.token;
  const targetedTokens = [...game.user.targets];
  const targeted = targetedTokens.map((t) => t.actor).filter(Boolean);

  for (const link of links) {
    const effect = await fromUuid(link.uuid);
    if (!effect) {
      console.warn(`${MODULE_ID} | spell effect ${link.uuid} not found`);
      continue;
    }
    const actors = actorsFor(link.landsOn, caster, targeted);
    if (!actors.length && link.landsOn !== "self") {
      ui.notifications.warn(`${spell.name}: target a creature to apply ${effect.name}.`);
      continue;
    }
    for (const target of actors) {
      if (!target.isOwner) {
        ui.notifications.warn(`${effect.name}: you do not own ${target.name}; ask the GM to drag it on.`);
        continue;
      }
      const targetToken = targetedTokens.find((t) => t.actor === target)?.document;
      // A recast refreshes: drop the copy this same spell already put here.
      const stale = target.itemTypes.effect.filter(
        (e) => e.sourceId === link.uuid && e.system.context?.origin?.item === spell.uuid,
      );
      if (stale.length) await target.deleteEmbeddedDocuments("Item", stale.map((e) => e.id));
      const source = foundry.utils.mergeObject(effect.toObject(), {
        _id: null,
        system: { context: effectContext({ caster, casterToken, spell, target, targetToken }) },
      });
      await target.createEmbeddedDocuments("Item", [source]);
    }
  }
}

if (typeof Hooks !== "undefined") {
  Hooks.once("init", () => {
    game.settings.register(MODULE_ID, "autoApplySpellEffects", {
      name: "Apply spell effects on cast",
      hint: "When a Cinderfall spell with a linked effect is cast, put the effect on the caster or the targeted creatures.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
    });
  });
  Hooks.once("ready", () => {
    if (game.system.id !== "pf2e") return;
    loadIndex();
  });
  Hooks.on("createChatMessage", async (message, _options, userId) => {
    if (userId !== game.user.id || game.system.id !== "pf2e") return;
    if (!game.settings.get(MODULE_ID, "autoApplySpellEffects")) return;
    try {
      await applyFor(message);
    } catch (err) {
      console.error(`${MODULE_ID} | applying spell effects failed`, err);
    }
  });
}
