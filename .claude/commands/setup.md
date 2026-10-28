---
description: Set up Family Map with your family, then put it online
---

Walk the person through setting up their own Family Map. One step at a time, say what each step does in one plain sentence, and wait for them before moving on. Define technical words the first time.

1. **Check tools.** `node --version` (20 or newer). If `node_modules/` is missing, run `npm install`.

2. **Interview them**, one question at a time:
   - Their first name (they become the `me` person).
   - Everyone else in the family they want on the map.
   - Pets, if any.
   - Whether to add a few sample memories so the map isn't empty at first (they can delete them later with `npm run db:clear-samples`).
   - Whether to set up local testing.

3. **Write `setup.json`**: `{ "me": "...", "people": [...], "pets": [...], "samples": true, "localDev": true }`. Confirm it with them. This file is git-ignored, so names stay out of the repo.

4. **Apply:** `npm run setup -- --apply`. It writes `seed/family.sql` (git-ignored) and, with local testing on, a random local passcode in `.dev.vars` plus a local database. Don't paste the passcode into chat; tell them where it is.

5. **Try it:** `npm run dev`, open http://localhost:5173, log in, and pick their name. Show them **Edit family** in the menu under their circle.

6. **Put it online** (when they say go), following README.md "Put it online":
   - `npx wrangler login`
   - `npx wrangler d1 create family-map` (you put the id into `wrangler.jsonc`)
   - `npx wrangler r2 bucket create family-map-media`
   - `npm run db:migrate`
   - `npx wrangler d1 execute family-map --remote --file=./seed/family.sql`
   - `npx wrangler secret put FAMILY_PASSCODE` (they type it)
   - `npm run deploy`

   R2 asks for a card on file in the Cloudflare dashboard. Tell them that before the bucket step.

7. **Share:** they send the URL and passcode to family. On iPhone: Safari, then Share, then Add to Home Screen.

End with three lines: what's live, how to add people later (Edit family), and how to redeploy (`npm run deploy`).
