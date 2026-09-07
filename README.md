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
creature traits, 11 feat traits, 14 languages, and 4 custom damage types
(`anchor`, `area-vitality-damage`, `coordinated-anchor`, `the-cut`). Without
the damage-type entries, 10 bestiary creatures carried weakness types PF2e does
not recognise. The accepted shape is validated by `isHomebrewCustomDamage` in
the system bundle: each value needs a string `label`, and an optional
`category` that must be `physical` or `energy` -- omitted here, because the
statblocks never say which these are and guessing would be a design call.

The 14 languages are the setting's whole list, sourced from the `languages` card
owner. `languages` is a real homebrew category (it heads the accepted-key array
in `readModuleHomebrewSettings`), and the `{slug: "Label"}` string form is
accepted. Registration is load-bearing rather than cosmetic: `AncestryPF2e`
grants `system.languages.value` at actor-prep time but only for slugs already in
`CONFIG.PF2E.languages`, so an unregistered slug is dropped **silently** -- the
language just never appears on the character. `build_pack.py` therefore fails
the build if any ancestry grants a language `module.json` does not register.

Cinderfall uses `common-cant`, not PF2e's `common`; no Cinderfall ancestry
grants `common`. Language *rarity* (the "never known automatically" tier that
`languages.html` S3 describes for the five faction tongues) is not module data
at all -- it lives in PF2e's world settings menu, so it is a GM setting, not
something this module can ship.

`scripts/body-tab.js` adds a "Body" tab to the PF2e character sheet for
tracking bio-augmentation, cybernetics and mutations against the ancestry's
body-slot data. **Its slot keys do not yet match the "Nine Slots" table the
augmentation pages author** -- see the note at the top of that file. That
conflict is unresolved and blocks converting the 241 augment records.
