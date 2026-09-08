# pf2e-cinderfall-module

Companion Foundry VTT module for the Cinderfall Pathfinder 2e homebrew setting.
Work in progress — currently a scaffold with no game content yet. Own git repo
(remote: `Choo-Choo-Oreo/pf2e-cinderfall-module`), separate from the Cinderfall
site repo it lives alongside on disk.

Built to the structure and manifest fields described in Foundry's own
[Module Development](https://foundryvtt.com/article/module-development/) article.

## Structure

- `module.json` — the manifest. `id` is `pf2e-cinderfall-module`, which must
  (and does) match the folder name Foundry installs it under. `compatibility`
  is set to `minimum: 13`, `verified: 14.361`, `maximum: 14` — matched to the
  Foundry V14 (build 361) install this is tested against, not to the pf2e
  system's own stated range. Declares `esmodules`, `styles`, `languages`, and
  a `relationships.systems` entry requiring `pf2e`. `url`/`manifest`/`readme`/
  `bugs` point at this repo's existing GitHub remote; there's no `download`
  entry yet since no release/tag exists to point it at.
- `scripts/main.js` — module entry point. It only logs on `init` and `ready`.
  The old `MANIFEST` / `syncPacksSource()` runtime sync was **deleted**: a
  World Item created at load would shadow the compendium copy and break the
  `Compendium.*` UUIDs ancestries use to grant their features. Content ships
  as compiled packs only.
- `styles/pf2e-cinderfall-module.css` — module styles (empty stub).
- `lang/en.json` — localization strings (empty-ish stub).
- `sync-to-foundry.py` — dev-only copy tool, see below. Excluded from the
  installed copy along with `.git`/`.gitattributes`/`.gitignore`.
- `packs-source/` — Foundry Item JSON, one file per record, in the same shape
  the real pf2e system uses for its own pack source
  (`pf2e-source/packs/pf2e/<pack>/<slug>.json` in the sibling checkout).
  Produced by the Cinderfall site repo's `tools/foundry/export_card.py` from
  a card record that has a `system`/`type` block — see that script's
  docstring. Not a built compendium pack (that needs Node tooling this
  machine doesn't have); see "Testing an export" below for how to load one
  anyway.
- `scripts/body-tab.js` — adds a crude "Body" tab to the PF2e character
  sheet. Named "Body," not "Augmentations," because bio-augmentation,
  cybernetic augmentation, and mutations all attach to the same body-slot
  data — none of them owns the tab more than the others. Slot counts
  (bodyParts/bodyWhole/inlays) are summed from `flags.cinderfall` across
  every item on the actor, not hardcoded — a future heritage/background/feat
  that carries its own `flags.cinderfall` block adds slots automatically.
  Each slot is a free-text field saved to
  `flags["pf2e-cinderfall-module"].installed`; no drag-and-drop or capacity
  validation yet. PF2e has no rule element for adding a new labeled feat-slot
  group to the real Feats tab (checked against the system's own rule-element
  wiki), so this lives as its own tab instead of piggybacking on Feats.

## Dev / testing loop

Foundry loads modules from `Data/modules/<id>`, so this repo has to be mirrored
there — it doesn't run in place. `sync-to-foundry.py` does that copy: it reads
`id` out of `module.json` (so it stays correct if the module is ever renamed)
and mirrors every file in this repo except the dev-only ones listed above.

```bash
python sync-to-foundry.py            # copy into the local Foundry install
python sync-to-foundry.py --dry-run  # preview only, changes nothing
python sync-to-foundry.py --dest-root X  # override if Foundry's user data lives elsewhere
python sync-to-foundry.py --clean    # wipe the installed copy first, then copy
```

Default target: `%LOCALAPPDATA%\FoundryVTT\Data\modules\pf2e-cinderfall-module`.
After syncing, enable "PF2e Cinderfall" in the world's Module Management, then
use **Reload All Clients** (or relaunch the world) to pick up script/style
changes — sync alone doesn't push the update to a running world.

Tested against Foundry V14 (build 361) with the PF2e system (installed system
version 8.5.0).

## Testing an export

Everything ships as real compiled compendium packs; nothing is created at
runtime. `scripts/main.js` no longer syncs anything -- the old `MANIFEST` /
`syncPacksSource()` loop was **deleted**, not disabled, because a world Item
created at load would shadow the compendium copy and break the `Compendium.*`
UUIDs that ancestries use to grant their features.

The loop is two commands from the Cinderfall site repo, in this order:

    python tools/foundry/export_all.py      # cards -> packs-source/
    python tools/foundry/build_pack.py --install

`build_pack.py` reads `packs-source/`, never the card layer, so skipping the
export silently ships stale packs. It writes LevelDB directly via `plyvel`
(Foundry's own CLI is Node). **LevelDB is single-writer and a loaded world
holds the lock**, so close or relaunch the world around a build.

Then relaunch the world and check the packs in the sidebar.

## Status

**8 compiled packs, 346 documents** (verified live in Foundry 14.361 /
pf2e 8.5.0 on 2026-09-07):

| pack | type | documents |
|---|---|---|
| ancestries | Item | 11 |
| ancestry-features | Item | 33 |
| heritages | Item | 34 |
| backgrounds | Item | 11 |
| feats | Item | 163 |
| deities | Item | 14 |
| equipment | Item | 48 |
| bestiary | Actor | 32 |

Verified live: all 8 packs load; a `Cinderfall Equipment` weapon resolves with
its price in gp and both `flags.cinderfall` blocks intact; a `Cinderfall
Bestiary` NPC resolves with its embedded strikes as real Strikes (with MAP
variants and persistent damage); and the homebrew `ratkin` trait renders on a
real character sheet.

`bestiary` is the only pack with `PLAYER: NONE` ownership, because it holds
`uriel.uriel-bound` and `uriel` is a sealed owner on the site. Foundry has no
per-document ownership inside a pack, so the whole pack takes the restrictive
setting.

### Homebrew registration

`module.json`'s `flags.pf2e-cinderfall-module.pf2e-homebrew` block registers 11
creature traits, 11 feat traits, 13 languages, and 4 custom damage types
(`anchor`, `area-vitality-damage`, `coordinated-anchor`, `the-cut`). Without
the damage-type entries, 10 bestiary creatures carried weakness types PF2e does
not recognise. The accepted shape is validated by `isHomebrewCustomDamage` in
the system bundle: each value needs a string `label`, and an optional
`category` that must be `physical` or `energy` -- omitted here, because the
statblocks never say which these are and guessing would be a design call.

The 13 languages are the setting's whole list, and the block is **generated**
from the `languages` card owner by `build_pack.py`'s `derive_languages()` --
never hand-edited. Every card carrying `export_as_language: true` becomes one
entry here, so adding a language is one card and nothing else. `languages` is a
real homebrew category (it heads the accepted-key array
in `readModuleHomebrewSettings`), and the `{slug: "Label"}` string form is
accepted. Registration is load-bearing rather than cosmetic: `AncestryPF2e`
grants `system.languages.value` at actor-prep time but only for slugs already in
`CONFIG.PF2E.languages`, so an unregistered slug is dropped **silently** -- the
language just never appears on the character. `build_pack.py` therefore fails
the build if any ancestry grants a language no card backs.

A language card is Foundry-shaped (`system` + `type`) but is **not** a
compendium document, because PF2e has no language Item type. `export_as_language`
is what routes it: `export_all.py` sends it to the manifest instead of
`packs-source/`. Without that flag the `system`/`type` pair alone made it a
document, and it landed in `packs-source/languages/` -- a directory no declared
pack ever built, so the card looked exported and reached nothing.
`flags.cinderfall.foundry.kind` picks the channel, since registering and
relabelling are different operations: `language` registers a new slug,
`language-rename` overrides one PF2e already ships. Both are checked against
the installed system's own 186-slug list when a system is present.

Cinderfall keeps PF2e's own `common` slug and **renames** it rather than
adding a second language beside it: `lang/en.json` overrides
`PF2E.Actor.Creature.Language.common` to "Common Cant". One slug, one entry in
the picker, and an imported PF2e creature shares a tongue with a Cinderfall PC
instead of being mutually unintelligible with one.

An earlier pass registered a separate `common-cant` homebrew language and had
every ancestry grant it. That worked but put the same name in the list twice
and split the setting's universal tongue away from every stat block PF2e ships.
Dropped 2026-09-07. `build_pack.py` allows `common` as the one unregistered
slug for this reason.

Note the key is `PF2E.Actor.Creature.Language.common`, NOT `PF2E.TraitCommon` --
the latter is the common *rarity* trait, and renaming it would relabel every
common item in the game.

### Currency

The coin ladder is renamed the same way `common` is -- by shadowing PF2e's own
i18n keys from `lang/en.json`, not by adding denominations. The setting has
exactly one currency (`site/data/cards/journals/currency/currency.credits.json`:
"One credit is one gold piece"), so the four coins are tiers of that one
currency, not four currencies:

| PF2e | Cinderfall | abbrev | value    |
|------|------------|--------|----------|
| pp   | Plate      | `pp`   | 10 cr    |
| gp   | Credit     | `cr`   | 1 cr     |
| sp   | Scrip      | `sp`   | 0.1 cr   |
| cp   | Chip       | `cp`   | 0.01 cr  |

Three of the four abbreviations survive as true initials of the new names, so
only `gp` -> `cr` actually changes shape on a sheet. Nothing about storage
moves: prices stay `{"gp": N}`, `Coins`/`DENOMINATION_RATES` are untouched, and
every published PF2e price still reads straight across. This is a label change
only.

Two keys per denomination, both flat dotted strings in `lang/en.json`:
`PF2E.Currency.<d>` (the long name) and `PF2E.CurrencyAbbreviations.<d>` (what
`Coins#toString` prints, so it is the one on nearly every price in the game).
`CONFIG.PF2E`'s currency map stores the *key* (`pp: "PF2E.Currency.pp"` in
`pf2e.mjs`), not the string, so overriding the key covers both surfaces at once.

**Two label surfaces this does not reach.** The coin *items* in
`Compendium.pf2e.equipment-srd` are still named "Gold Pieces" etc. -- pack
document names are not i18n'd. And Item Piles ships its own pf2e integration
(`modules/itempiles-pf2e/module.js`) that registers four item-backed currencies
via `game.itempiles.API.addSystemIntegration`, each with its own literal
`abbreviation` (`"{#}GP"`) and `exchangeRate` (gp is `primary: true`,
`exchangeRate: 1`). Its labels come from that array, not from PF2e's i18n, so a
complete rename means overriding the Item Piles config too. Not done here.

`tests/currency-labels.test.mjs` covers the data: every denomination renamed, no
two sharing a name or abbreviation, no vanilla metal left through, and the keys
written flat rather than as a nested `PF2E` object (which Foundry would
deep-merge into a sibling branch and override nothing).

### Language rarity

Rarity has no document to ride in -- PF2e has no language Item, so unlike
equipment (which carries `system.traits.rarity`) a language's tier lives in one
world setting, `game.settings.get("pf2e", "homebrew.languageRarities")`: a
DataModel of `{ commonLanguage, uncommon, rare, secret, unavailable }` where
anything in none of the sets is common.

The card is the source: each language card carries
`flags.cinderfall.foundry.rarity`, null meaning common (PF2e stores no common
set -- it derives common as "in none of the sets"). `build_pack.py` **generates**
`flags.pf2e-cinderfall-module.languageRarities` from those cards, and
`scripts/main.js` writes it to the setting on ready. `languages.html` paints the
same tier as `cc-tier-*` -- the vocabulary `equipment.html` uses, where the page
word `exotic` bridges to PF2e's `secret` -- and the build fails if the page and
the cards disagree, naming the page as the thing to fix. The script
applies a map once and stamps it, so a GM who re-tiers a language by hand keeps
that choice while a genuine change to the shipped map still lands.

Rarity gates *choosing*, not *granting*: Glass-Sign sits at rare and Glassblood
still receive it free from their ancestry.

**Language rarity is closed; item rarity is half-open.** `rarities` is not among
the 13 homebrew-registerable categories, so neither ladder extends the way traits
and languages do. Past that they differ, and this file used to flatten both into
"not possible", which was wrong for items.

*Languages are genuinely closed.* The tier list is a separate frozen
`["common","uncommon","rare","secret"]` (pf2e `creature/values.ts:296`) and the
`homebrew.languageRarities` setting is a DataModel with one field per tier, so a
Cinderfall-named language tier has nowhere to be stored. `languages.html`'s
`cc-tier-exotic` on Echo-Tongue still maps down to `secret`.

*Items are open on the display side.* Every consumer of a rarity label reads
`CONFIG.PF2E.rarityTraits` -- item sheets (`item/base/sheet/sheet.ts:161`), chat
cards (`item/physical/document.ts:782`), and the compendium browser's rarity
filter, which builds its checkboxes by mapping whatever record it is handed
(`tabs/base.svelte.ts:274`) -- and that is a plain object the system never
freezes. `scripts/main.js` registers `epic`, `legendary`, `mythic` and `exotic`
into it on `setup` from `module.json` flags, with colours in
`styles/pf2e-cinderfall-module.css`.

*Timing is load-bearing, and getting it wrong is silent.* Foundry's order is
`init` -> `initializePacks` -> `initializeDocuments` -> `setup` -> `ready`, so
every world AND compendium document is constructed and validated BEFORE `setup`
runs. Registering on `setup` widens the ladder in time for later edits but not
in time for load: a stored document at a Cinderfall tier is rejected at
construction and parked in `invalidDocumentIds` -- it vanishes from
`game.items.get()` and appears under Support & Issues > Document Issues -- while
every in-session edit keeps working. Measured 2026-09-07: with `setup` timing,
1 invalid world item and `game.items.get(<id>)` returning nothing; with `init`
timing, 0 invalid and the same id reading `epic`. Registration therefore happens
on `init`, where `CONFIG.Item/Actor.dataModels` is already populated because
PF2e assigns it at script-evaluation time (`scripts/hooks/load.ts:63`). The
label half keeps a `setup` fallback, since `CONFIG.PF2E` is assigned in PF2e's
own `init` listener (`hooks/init.ts:33`) and listener order between a system and
a module is not guaranteed.

*The storage side needed a second patch, and now works.* Labels alone are not
enough: a schema-backed document validates rarity against `choices` on its
`RarityField` (pf2e `module/model.ts:7`), which is the frozen `RARITIES` array,
so a sheet edit to a Cinderfall tier failed with `rarity: <tier> is not a valid
choice` even while the dropdown offered it. `scripts/main.js` therefore also
widens `choices` on every rarity field it finds by walking the schemas of every
registered Item and Actor DataModel. The array is replaced, never pushed to.

Verified 2026-09-07 against a live world (pf2e 8.5.0, Foundry 14.361), via
`Item.create`/`Item#update` rather than any bridge:

    7 rarity fields patched: Item.class, Item.feat, Item.heritage,
      Item.treasure, Actor.army, Actor.hazard, Actor.vehicle
    feat create at `epic`      -> stored `epic`
    feat update epic->mythic   -> stored `mythic`  (this threw before the patch)
    all four tiers             -> epic/legendary/mythic/exotic all stick
    NEGATIVE CONTROL: junk     -> silently dropped, value unchanged
    `CONFIG.PF2E.rarityTraits.epic` localises to "Epic"

That negative control is the load-bearing half: validation is still ON, so the
patch widened the ladder rather than disabling the guard. Note Foundry does not
throw on an invalid `choices` value in this path -- it drops the change and
keeps the prior value, while surfacing a UI notification. Assert on the stored
value, never on whether an exception was raised.

Not every type is even validated: in 8.5.0 only 10 item and 6 actor types are
DataModels (pf2e `scripts/hooks/load.ts:102-122`). `equipment`, `weapon`,
`armor`, `spell` and `consumable` carry no schema and accept any string. Of the
1903 documents in `packs-source`, 1240 (feat 1014, action 191, heritage 34,
class 1) are schema-backed and depend on this patch; the other 663 never needed
it. Do not generalise a result from an unvalidated type.

One consequence to know: `choices` lives on shared field instances, so the four
tiers become selectable on base Paizo content too, in memory, for the session.
Nothing is written to PF2e's own files.

`convert_equipment.py` still maps the page's `epic` down to `rare`; that mapping
is now optional rather than forced, and changing it is a separate decision in
the site repo.

`scripts/body-tab.js` adds a "Body" tab to the PF2e character sheet for
tracking bio-augmentation, cybernetics and mutations against the ancestry's
body-slot data. **Its slot keys do not yet match the "Nine Slots" table the
augmentation pages author** -- see the note at the top of that file. That
conflict is unresolved and blocks converting the 241 augment records.
