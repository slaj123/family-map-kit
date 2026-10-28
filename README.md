# Family Map

A private map of your family's memories and plans. Everyone in the family pins stories to places, with photos and voice notes, and can browse them on a shared map or as a list. It installs to the phone's home screen like an app.

This is a **setup kit**: the full app with a small sample family. Deploy your own copy, and your family's data lives only in your own Cloudflare account.

- **Memories at places.** Search for a place or tap **I'm here**, then add a title, a category (travel, food, experiences, sports, accomplishments or places), a date as exact or loose as you remember it, who was there, and the story.
- **Photos and voice notes.** Photos are added from the phone, including iPhone HEIC, and voice notes are recorded in the app. Both are stored in R2.
- **Plans too.** Future-dated memories show as plans.
- **Thoughts.** Family members can leave comments on any memory.
- **Pets can post.** A pet "author" lets you write a memory in the dog's voice.
- **One family passcode.** Login is limited to 10 tries per minute per IP. Each device picks who's using it once.

Built with React, Vite and MapLibre (free OpenFreeMap tiles), served by a Cloudflare Worker, with a D1 (SQLite) database and an R2 bucket for media. It runs on Cloudflare's free plan (R2 asks for a card on file).

## What you need

- [Node.js](https://nodejs.org) 20 or newer
- A free [Cloudflare](https://dash.cloudflare.com/sign-up) account

## 1. Install

```bash
git clone https://github.com/<your-username>/family-map-kit.git
cd family-map-kit
npm install
```

## 2. Add your family

```bash
npm run setup
```

It asks for your name, everyone else in your family, and any pets. It also asks whether you want a few sample memories and whether to set up local testing. Your answers go into `setup.json` and `seed/family.sql`. **Both are git-ignored, so your family's names never end up in your repo.** They only go into your own database.

With local testing on, it also creates `.dev.vars` with a random local passcode and a local database. Then:

```bash
npm run dev
```

Open http://localhost:5173, log in with the passcode in `.dev.vars`, and pick your name.

**Change the family later:** in the app, tap your circle (top right), then **Edit family**. Add people or pets, rename them, or remove anyone who isn't in a memory yet. If you skip `npm run setup` entirely, the app opens on a "Who's in your family?" screen the first time.

**Just want to look around first?** `npm run db:init && npm run db:seed` loads a made-up family with sample memories.

**On your phone (same Wi-Fi):** `npm run dev:phone`, then open the `https://192.168.x.x:5173` address it prints. Safari warns about the certificate the first time; tap **Show Details**, then **visit this website**.

**Set up with Claude Code:** open this folder in [Claude Code](https://claude.com/claude-code) and type `/setup`. It asks the same questions in conversation, applies them, and walks you through putting it online.

## 3. Put it online

1. Log in to Cloudflare:
   ```bash
   npx wrangler login
   ```
2. Create the database and the media bucket:
   ```bash
   npx wrangler d1 create family-map
   npx wrangler r2 bucket create family-map-media
   ```
   Paste the `database_id` into `wrangler.jsonc`, replacing `REPLACE_WITH_D1_DATABASE_ID`.
3. Create the tables, then add your family from setup:
   ```bash
   npm run db:migrate
   npx wrangler d1 execute family-map --remote --file=./seed/family.sql
   ```
   Want the sample memories online too? Also run `npx wrangler d1 execute family-map --remote --file=./seed/sample-memories.sql`. Skipping this step works as well: the app asks who's in your family on first open.
4. Set the family passcode. It is case-sensitive:
   ```bash
   npx wrangler secret put FAMILY_PASSCODE
   ```
5. Build and deploy:
   ```bash
   npm run deploy
   ```
   It prints your URL, something like `https://family-map.<your-subdomain>.workers.dev`.

Send the link and passcode to your family. On iPhone: open the link in Safari, then **Share → Add to Home Screen**.

## Changing things later

- **Family members:** tap your circle, then **Edit family**.
- **Categories and colors:** `CATEGORIES` in `src/types.ts`.
- **App name and icon:** `index.html`, `public/manifest.webmanifest`, and `npm run icons`.
- **Database changes:** add a file in `migrations/`, then run `npm run db:migrate`.
- **Type checking:** run `npm run types` once to generate the Worker types, then `npm run typecheck`.
- **Change the passcode:** `npx wrangler secret put FAMILY_PASSCODE`. Everyone signs in again.

## Privacy

Photos, voice notes and stories stay in your own D1 database and R2 bucket. Media is served only to signed-in devices. Never commit `.dev.vars`, and keep any exports in a git-ignored folder.

## License

MIT. See `LICENSE`.
