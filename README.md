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
- `scripts/main.js` — module entry point. On `init` it just logs. On `ready`,
  if a GM is present, it automatically syncs every path listed in its own
  `MANIFEST` array from `packs-source/` into World Items (create or update,
  matched by minted `_id` via Foundry's `keepId` option) — this is the
  module's real, self-contained update path. No macro, no manual step.
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
- `scripts/augmentation-tab.js` — adds a crude "Augments" tab to the PF2e
  character sheet. Slot counts (bodyParts/bodyWhole/inlays) are summed from
  `flags.cinderfall` across every item on the actor, not hardcoded — a
  future heritage/background/feat that carries its own `flags.cinderfall`
  block adds slots automatically. Each slot is a free-text field saved to
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

There's no compendium-pack build in this loop yet (that's `classic-level` or
`@foundryvtt/foundryvtt-cli`, both Node-based, and this machine has neither
installed) -- so `packs-source/*.json` isn't something Foundry loads as a
real compendium pack. Instead, `scripts/main.js` reads it directly:

1. `python sync-to-foundry.py` from the site machine, so the module folder
   (including `packs-source/`) is mirrored into your Foundry install.
2. Reload the world (Module Management > Reload All Clients, or relaunch).
   As GM, `main.js`'s `ready` hook automatically fetches every path in its
   `MANIFEST` array (right now just `packs-source/ancestries/human.json`)
   over your own local Foundry server and creates or updates a World Item
   from it -- no macro, no manual step, nothing outside your own client
   touched. Re-running after a source file changes updates the same Item
   (matched by its minted `_id`, via Foundry's `keepId` create option)
   rather than duplicating it.
3. Open the created Item's sheet and check it against
   `packs-source/ancestries/human.json` by eye -- this is the actual proof
   that Foundry's `ancestry` DataModel accepted every field, not just that
   the create call didn't throw.

Add more entries to `MANIFEST` in `scripts/main.js` as more `packs-source/*.json`
files land.

## Status

One real export staged and auto-imported on world load: `packs-source/ancestries/human.json`
(Cinderfall's Human ancestry) -- verified live: `Test Dummy (Human)`, a
disposable test-world character, resolves HP 8/8 and the ancestry's traits
correctly with the item attached. A crude "Augments" tab
(`scripts/augmentation-tab.js`) also exists for visually tracking installed
augmentations against the ancestry's body-slot data. Everything else is
still scaffold.
