# Family Map: notes for Claude Code

A private family map of memories: React + Vite front end (`src/`), a Cloudflare Worker API (`worker/index.ts`), D1 for data and R2 for photos and voice notes. See README.md.

## If the person wants to set it up

Run the `/setup` command (`.claude/commands/setup.md`): interview them, write `setup.json`, run `npm run setup -- --apply`, then walk them through deploying. Assume they may never have used a terminal. Explain each step in one line before running it.

## Where personal choices live

- **Family members never go in committed files.** `setup.json` and `seed/family.sql` are git-ignored, and the names live only in their D1 database. Don't move names into `seed/sample-*.sql` or source code.
- In the app: tap your circle, then **Edit family** to add, rename or remove people and pets (`/api/people`). Someone who appears in memories can't be removed, only renamed.
- On a fresh database with nobody in it, the app opens on a "Who's in your family?" screen, so setup can also happen entirely in the app.
- The person whose id is `me` is the one the Habits kit counts memories for.
- Secret: `FAMILY_PASSCODE` (`wrangler secret put` online, `.dev.vars` locally). Never commit it or repeat it in chat.

## Checks before calling anything done

- `npm run typecheck` (run `npm run types` once first), then `npm run build`.
- `npm run dev`, log in with the passcode in `.dev.vars`, and try Edit family plus adding a memory.
