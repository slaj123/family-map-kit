// npm run setup: tell the map who's in your family.
// Writes setup.json (your answers) and seed/family.sql. Both are git-ignored, so
// names never end up in your repo; they only go into your own database.
// `npm run setup -- --apply` skips the questions and applies setup.json as-is.
import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { APPLY_ONLY, loadSetup, saveSetup, ask, askList, askYesNo, done, wrangler, sqlString } from "./lib/setup-kit.mjs";

const s = loadSetup("setup.json", { me: "", people: [], pets: [], samples: true, localDev: true });

if (!APPLY_ONLY) {
  console.log("Family Map setup. Press Enter to keep the value in [brackets].\n");
  s.me = await ask("Your first name (you'll show as this on the map)", s.me);
  s.people = await askList("Everyone else in the family", s.people);
  s.pets = await askList("Pets (leave blank for none)", s.pets);
  s.samples = await askYesNo("Add a few sample memories so the map isn't empty? (removable later)", s.samples);
  s.localDev = await askYesNo("Set up local testing now (local passcode + local database)?", s.localDev);
  saveSetup("setup.json", s);
}
done();

if (!s.me.trim()) {
  console.error("Setup needs your name (\"me\" in setup.json).");
  process.exit(1);
}

// You are always id "me" (the Habits kit counts memories by that id). Others get ids from their names.
const used = new Set(["me"]);
const idFor = (name) => {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "person";
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
};
const rows = [
  ["me", s.me.trim(), "person"],
  ...s.people.map((n) => [idFor(n), n, "person"]),
  ...s.pets.map((n) => [idFor(n), n, "pet"]),
].map(([id, name, kind], i) => `  (${sqlString(id)}, ${sqlString(name)}, ${sqlString([...name][0].toUpperCase())}, '${kind}', ${i + 1})`);

writeFileSync("seed/family.sql",
  "-- Your family, from `npm run setup`. Git-ignored: names stay out of your repo.\n" +
  "INSERT OR IGNORE INTO people (id, name, initial, kind, sort) VALUES\n" + rows.join(",\n") + ";\n");
console.log(`Wrote seed/family.sql (${rows.length} people and pets).`);

if (s.localDev) {
  if (!existsSync(".dev.vars")) {
    const passcode = randomBytes(9).toString("base64url");
    writeFileSync(".dev.vars", `FAMILY_PASSCODE=${passcode}\n`);
    console.log(`Wrote .dev.vars (git-ignored). Your LOCAL family passcode is: ${passcode}`);
  }
  wrangler("d1", "migrations", "apply", "family-map", "--local");
  wrangler("d1", "execute", "family-map", "--local", "--file=./seed/family.sql");
  if (s.samples) wrangler("d1", "execute", "family-map", "--local", "--file=./seed/sample-memories.sql");
  console.log("\nLocal map ready. Run `npm run dev` and open http://localhost:5173.");
}
console.log("To put it online, follow \"Put it online\" in README.md (or ask Claude Code: /setup).");
console.log("You can add, rename or remove family members any time in the app: tap your circle, then Edit family.");
