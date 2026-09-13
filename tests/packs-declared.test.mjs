/**
 * Every built pack must be declared in module.json.
 *
 * `build_pack.py` writes a LevelDB directory under `packs/` for each entry in
 * its own PACKS list. Foundry, though, only loads what `module.json` declares,
 * and it reads that list at STARTUP. The two lists are maintained by hand, in
 * different files, in different languages, and nothing has ever compared them.
 *
 * This is a silent failure in the worst way: the build succeeds, the directory
 * exists, the documents are really in it, and the compendium simply is not
 * there in the sidebar. `packs/journals` sat like that with 53 lore entries in
 * it -- built by every run, loaded by nobody. There is no error to grep for,
 * because from Foundry's side the pack was never mentioned.
 *
 * `packs/` is gitignored (.gitignore:9), so this check is a no-op on a fresh
 * clone and only bites once someone has actually run a build.
 *
 * Run: node tests/packs-declared.test.mjs
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const manifest = JSON.parse(readFileSync(join(root, "module.json"), "utf8"));
const declared = new Map(manifest.packs.map((p) => [p.name, p]));

// A declaration whose directory is missing is the mirror-image bug: Foundry
// logs a load failure for it, but only in the console, only at startup.
for (const [name, p] of declared) {
  assert.equal(p.path, `packs/${name}`,
    `module.json: pack "${name}" has path "${p.path}"; build_pack.py writes packs/${name}`);
  assert.ok(p.type, `module.json: pack "${name}" declares no document type`);
}

const packsDir = join(root, "packs");
if (!existsSync(packsDir)) {
  console.log("packs-declared: no packs/ directory (nothing built here); skipped");
  process.exit(0);
}

const built = readdirSync(packsDir).filter((d) => statSync(join(packsDir, d)).isDirectory());
assert.ok(built.length > 0, "packs/ exists but is empty");

const undeclared = built.filter((d) => !declared.has(d));
assert.deepEqual(undeclared, [],
  `built but never declared in module.json, so Foundry will not load ${undeclared.length === 1 ? "it" : "them"}: `
  + `${undeclared.join(", ")} -- add a packs[] entry (and relaunch the world; the list is read at startup)`);

// Not an assertion: a declared pack with no directory is legitimate mid-work,
// before the first build. Report it so it is visible either way.
const unbuilt = [...declared.keys()].filter((n) => !built.includes(n));

console.log(`packs-declared: ${built.length} built, ${declared.size} declared, 0 undeclared`
  + (unbuilt.length ? ` (declared but not built here: ${unbuilt.join(", ")})` : ""));
