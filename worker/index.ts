// API for Family Map. Serves /api/* (JSON) and /media/* (photos + voice memos from R2).
// Everything else is the React app, served by Cloudflare's static assets.

interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  FAMILY_PASSCODE: string;
  LOGIN_LIMIT: RateLimit;
}

const CATEGORIES = ["travel", "food", "experience", "sports", "accomplishment", "property"];
const PRECISIONS = ["day", "month", "season", "year"];
const COOKIE = "fmap_auth";
const ONE_YEAR = 60 * 60 * 24 * 365;
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_VOICE_BYTES = 25 * 1024 * 1024;
const MAX_VOICE_SECONDS = 10 * 60;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });

const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function readCookie(req: Request, name: string) {
  const match = (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// One shared family passcode. The cookie holds a hash of it, so changing the passcode
// logs everyone out. Login attempts are rate limited per IP so it can't be brute-forced.
const authToken = (env: Env) => sha256(`fmap:${env.FAMILY_PASSCODE}`);

async function isAuthed(req: Request, env: Env) {
  return !!env.FAMILY_PASSCODE && readCookie(req, COOKIE) === (await authToken(env));
}

// Identity is the honor system: the app sends whoever picked their face on this device.
async function currentPerson(req: Request, env: Env) {
  const id = req.headers.get("x-person");
  if (!id) throw new HttpError(400, "Pick who you are first.");
  const row = await env.DB.prepare("SELECT id FROM people WHERE id = ? AND kind = 'person'").bind(id).first<{ id: string }>();
  if (!row) throw new HttpError(400, "Unknown family member.");
  return row.id;
}

async function readBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Request body must be JSON.");
  }
}

// ---------- people ----------
// Anyone signed in can add family members and pets, rename them, or remove someone
// nobody has tagged or posted as yet (removing would orphan memories otherwise).

const slug = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "person";

function personFields(input: any) {
  const name = typeof input?.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 30) throw new HttpError(400, "Names are 1 to 30 characters.");
  const raw = typeof input?.initial === "string" ? input.initial.trim() : "";
  const initial = [...(raw || name)].slice(0, raw ? 2 : 1).join("").toUpperCase();
  return { name, initial };
}

async function addPerson(req: Request, env: Env) {
  const input = await readBody<any>(req);
  const { name, initial } = personFields(input);
  const kind = input?.kind === "pet" ? "pet" : "person";
  let id = slug(name);
  for (let n = 2; await env.DB.prepare("SELECT 1 FROM people WHERE id = ?").bind(id).first(); n++) id = `${slug(name)}-${n}`;
  const max = await env.DB.prepare("SELECT COALESCE(MAX(sort), 0) AS s FROM people").first<{ s: number }>();
  await env.DB.prepare("INSERT INTO people (id, name, initial, kind, sort) VALUES (?, ?, ?, ?, ?)")
    .bind(id, name, initial, kind, (max?.s ?? 0) + 1).run();
  return json({ id, name, initial, kind }, 201);
}

async function updatePerson(req: Request, env: Env, id: string) {
  const { name, initial } = personFields(await readBody<any>(req));
  const r = await env.DB.prepare("UPDATE people SET name = ?, initial = ? WHERE id = ?").bind(name, initial, id).run();
  if (!r.meta.changes) throw new HttpError(404, "That person isn't in the family list.");
  return json({ ok: true });
}

async function removePerson(env: Env, id: string) {
  const used = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM memory_people WHERE person_id = ?1) + (SELECT COUNT(*) FROM memories WHERE created_by = ?1)
      + (SELECT COUNT(*) FROM places WHERE created_by = ?1) + (SELECT COUNT(*) FROM media WHERE added_by = ?1)
      + (SELECT COUNT(*) FROM thoughts WHERE author = ?1) AS n`
  ).bind(id).first<{ n: number }>();
  if (used && used.n > 0) throw new HttpError(409, "They're in some memories, so they can't be removed. You can rename them instead.");
  await env.DB.prepare("DELETE FROM people WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

// ---------- memories ----------

interface MemoryInput {
  place: { id: string } | { name: string; lat: number; lng: number };
  title: string;
  category: string;
  date_start: string;
  date_precision: string;
  date_end?: string | null; // same precision as date_start; for repeating memories only the year counts
  ongoing?: boolean;
  repeats?: boolean;
  story: string;
  people: string[];
  posted_by?: string;
}

function validateMemory(input: MemoryInput) {
  const title = (input.title ?? "").trim();
  if (!title) throw new HttpError(400, "Give the memory a title.");
  if (title.length > 120) throw new HttpError(400, "Keep the title under 120 characters.");
  if (!CATEGORIES.includes(input.category)) throw new HttpError(400, "Pick a category.");
  if (!PRECISIONS.includes(input.date_precision)) throw new HttpError(400, "Unknown date type.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date_start ?? "")) throw new HttpError(400, "Pick a date.");
  if (!Array.isArray(input.people) || input.people.length === 0) throw new HttpError(400, "Tag at least one person.");
  if ((input.story ?? "").length > 20000) throw new HttpError(400, "Story is too long.");

  const repeats = !!input.repeats;
  const ongoing = !!input.ongoing;
  if (repeats && input.date_precision === "year") throw new HttpError(400, "Pick a season, month, or day to repeat.");
  let end: string | null = null;
  if (!ongoing && input.date_end) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date_end)) throw new HttpError(400, "Pick an end date.");
    const endCmp = repeats ? input.date_end.slice(0, 4) : input.date_end;
    const startCmp = repeats ? input.date_start.slice(0, 4) : input.date_start;
    if (endCmp < startCmp) throw new HttpError(400, "The end can't be before the start.");
    end = input.date_end;
  }
  return { title, story: (input.story ?? "").trim(), end, ongoing: ongoing ? 1 : 0, repeats: repeats ? 1 : 0 };
}

async function resolvePlace(env: Env, place: MemoryInput["place"], person: string) {
  if (place && "id" in place) {
    const row = await env.DB.prepare("SELECT id FROM places WHERE id = ?").bind(place.id).first();
    if (!row) throw new HttpError(400, "That place no longer exists.");
    return place.id;
  }
  const name = (place?.name ?? "").trim();
  const { lat, lng } = place ?? ({} as any);
  if (!name) throw new HttpError(400, "Name the place.");
  if (typeof lat !== "number" || typeof lng !== "number" || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new HttpError(400, "Pick a spot on the map.");
  }
  const id = newId();
  await env.DB.prepare("INSERT INTO places (id, name, lat, lng, created_by) VALUES (?, ?, ?, ?, ?)")
    .bind(id, name.slice(0, 120), lat, lng, person)
    .run();
  return id;
}

async function checkPeople(env: Env, people: string[]) {
  const unique = [...new Set(people)];
  const { results } = await env.DB.prepare(
    `SELECT id FROM people WHERE id IN (${unique.map(() => "?").join(",")})`
  ).bind(...unique).all();
  if (results.length !== unique.length) throw new HttpError(400, "Unknown person tagged.");
  return unique;
}

async function getMemoryRow(env: Env, id: string) {
  const row = await env.DB.prepare("SELECT * FROM memories WHERE id = ?").bind(id).first<any>();
  if (!row) throw new HttpError(404, "Memory not found.");
  const { results } = await env.DB.prepare("SELECT person_id FROM memory_people WHERE memory_id = ?").bind(id).all<any>();
  return { ...row, people: results.map((r) => r.person_id) as string[] };
}

// Anyone in the family can add to or edit any memory. Deleting stays with whoever posted it,
// except the dog's posts, which anyone can clean up.
async function canDelete(env: Env, createdBy: string, person: string) {
  if (createdBy === person) return true;
  const author = await env.DB.prepare("SELECT kind FROM people WHERE id = ?").bind(createdBy).first<{ kind: string }>();
  return author?.kind === "pet";
}

// A person can post as themselves, or hand the phone to the dog.
async function resolveAuthor(env: Env, person: string, postedBy?: string) {
  if (!postedBy || postedBy === person) return person;
  const row = await env.DB.prepare("SELECT kind FROM people WHERE id = ?").bind(postedBy).first<{ kind: string }>();
  if (row?.kind !== "pet") throw new HttpError(400, "You can only post as yourself or the dog.");
  return postedBy;
}

async function world(env: Env) {
  const [people, places, memories, tags, media, thoughts, covers] = await env.DB.batch([
    env.DB.prepare("SELECT id, name, initial, kind FROM people ORDER BY sort"),
    env.DB.prepare("SELECT id, name, lat, lng FROM places"),
    env.DB.prepare(
      "SELECT id, place_id, title, category, date_start, date_precision, date_end, ongoing, repeats, created_by, created_at FROM memories ORDER BY date_start"
    ),
    env.DB.prepare("SELECT memory_id, person_id FROM memory_people"),
    env.DB.prepare("SELECT memory_id, kind, COUNT(*) AS n FROM media WHERE thought_id IS NULL GROUP BY memory_id, kind"),
    env.DB.prepare("SELECT memory_id, COUNT(*) AS n FROM thoughts GROUP BY memory_id"),
    // The first photo added to each memory, used as its cover in the list view.
    env.DB.prepare(
      `SELECT m.memory_id, m.id FROM media m
       WHERE m.kind = 'photo' AND m.thought_id IS NULL
         AND m.added_at = (SELECT MIN(x.added_at) FROM media x WHERE x.memory_id = m.memory_id AND x.kind = 'photo' AND x.thought_id IS NULL)`
    ),
  ]);

  const tagMap = new Map<string, string[]>();
  for (const t of tags.results as any[]) {
    tagMap.set(t.memory_id, [...(tagMap.get(t.memory_id) ?? []), t.person_id]);
  }
  const mediaMap = new Map<string, { photos: number; voices: number }>();
  for (const m of media.results as any[]) {
    const entry = mediaMap.get(m.memory_id) ?? { photos: 0, voices: 0 };
    if (m.kind === "photo") entry.photos = m.n;
    else entry.voices = m.n;
    mediaMap.set(m.memory_id, entry);
  }
  const thoughtMap = new Map((thoughts.results as any[]).map((t) => [t.memory_id, t.n as number]));
  const coverMap = new Map((covers.results as any[]).map((c) => [c.memory_id, c.id as string]));
  const byPlace = new Map<string, any[]>();
  for (const m of memories.results as any[]) {
    const full = {
      ...m,
      people: tagMap.get(m.id) ?? [],
      ...(mediaMap.get(m.id) ?? { photos: 0, voices: 0 }),
      thoughts: thoughtMap.get(m.id) ?? 0,
      cover: coverMap.get(m.id) ?? null,
    };
    byPlace.set(m.place_id, [...(byPlace.get(m.place_id) ?? []), full]);
  }
  return {
    people: people.results,
    places: (places.results as any[])
      .map((p) => ({ ...p, memories: byPlace.get(p.id) ?? [] }))
      .filter((p) => p.memories.length > 0),
  };
}

async function memoryDetail(env: Env, id: string) {
  const memory = await getMemoryRow(env, id);
  const place = await env.DB.prepare("SELECT id, name, lat, lng FROM places WHERE id = ?").bind(memory.place_id).first();
  const { results } = await env.DB.prepare(
    "SELECT id, kind, content_type, width, height, duration_sec, added_by, added_at, thought_id, thumb_key IS NOT NULL AS has_thumb FROM media WHERE memory_id = ? ORDER BY added_at"
  ).bind(id).all<any>();
  const thoughts = await env.DB.prepare(
    "SELECT id, author, text, created_at, updated_at FROM thoughts WHERE memory_id = ? ORDER BY created_at"
  ).bind(id).all<any>();
  return {
    ...memory,
    place,
    media: results.filter((m) => !m.thought_id),
    thoughts: thoughts.results.map((t) => ({ ...t, voice: results.find((m) => m.thought_id === t.id) ?? null })),
  };
}

async function createMemory(req: Request, env: Env) {
  const person = await currentPerson(req, env);
  const input = await readBody<MemoryInput>(req);
  const { title, story, end, ongoing, repeats } = validateMemory(input);
  const author = await resolveAuthor(env, person, input.posted_by);
  // The dog is always in the memories he tells.
  const people = await checkPeople(env, author === person ? input.people : [...(input.people ?? []), author]);
  const placeId = await resolvePlace(env, input.place, author);
  const id = newId();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO memories (id, place_id, title, category, date_start, date_precision, date_end, ongoing, repeats, story, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, placeId, title, input.category, input.date_start, input.date_precision, end, ongoing, repeats, story, author),
    ...people.map((p) => env.DB.prepare("INSERT INTO memory_people (memory_id, person_id) VALUES (?, ?)").bind(id, p)),
  ]);
  return json(await memoryDetail(env, id), 201);
}

async function updateMemory(req: Request, env: Env, id: string) {
  const person = await currentPerson(req, env);
  const existing = await getMemoryRow(env, id);
  const input = await readBody<MemoryInput>(req);
  const { title, story, end, ongoing, repeats } = validateMemory(input);
  const people = await checkPeople(env, input.people);
  const placeId = await resolvePlace(env, input.place, person);
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE memories SET place_id = ?, title = ?, category = ?, date_start = ?, date_precision = ?, date_end = ?, ongoing = ?, repeats = ?, story = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
    ).bind(placeId, title, input.category, input.date_start, input.date_precision, end, ongoing, repeats, story, id),
    env.DB.prepare("DELETE FROM memory_people WHERE memory_id = ?").bind(id),
    ...people.map((p) => env.DB.prepare("INSERT INTO memory_people (memory_id, person_id) VALUES (?, ?)").bind(id, p)),
  ]);
  await deleteEmptyPlace(env, existing.place_id);
  return json(await memoryDetail(env, id));
}

async function deleteMemory(req: Request, env: Env, id: string) {
  const person = await currentPerson(req, env);
  const existing = await getMemoryRow(env, id);
  if (!(await canDelete(env, existing.created_by, person))) {
    throw new HttpError(403, "Only the person who added this memory can delete it.");
  }
  const { results } = await env.DB.prepare("SELECT r2_key, thumb_key FROM media WHERE memory_id = ?").bind(id).all<any>();
  const keys = results.flatMap((r) => [r.r2_key, r.thumb_key]).filter(Boolean);
  if (keys.length) await env.MEDIA.delete(keys);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM media WHERE memory_id = ?").bind(id),
    env.DB.prepare("DELETE FROM thoughts WHERE memory_id = ?").bind(id),
    env.DB.prepare("DELETE FROM memory_people WHERE memory_id = ?").bind(id),
    env.DB.prepare("DELETE FROM memories WHERE id = ?").bind(id),
  ]);
  await deleteEmptyPlace(env, existing.place_id);
  return json({ ok: true });
}

async function deleteEmptyPlace(env: Env, placeId: string) {
  await env.DB.prepare("DELETE FROM places WHERE id = ? AND NOT EXISTS (SELECT 1 FROM memories WHERE place_id = ?)")
    .bind(placeId, placeId)
    .run();
}

// ---------- media ----------

function extFor(type: string) {
  if (type.includes("jpeg")) return "jpg";
  if (type.includes("webp")) return "webp";
  if (type.includes("png")) return "png";
  if (type.includes("mp4") || type.includes("aac") || type.includes("m4a")) return "m4a";
  if (type.includes("webm")) return "webm";
  if (type.includes("ogg")) return "ogg";
  return "bin";
}

async function addMedia(req: Request, env: Env, memoryId: string) {
  const person = await currentPerson(req, env);
  await getMemoryRow(env, memoryId);

  const form = await req.formData();
  const kind = form.get("kind");
  const file = form.get("file");
  if (kind !== "photo" && kind !== "voice") throw new HttpError(400, "Unknown media type.");
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "No file attached.");

  const type = file.type || "application/octet-stream";
  if (kind === "photo" && !type.startsWith("image/")) throw new HttpError(400, "That isn't a photo.");
  if (kind === "voice" && !type.startsWith("audio/")) throw new HttpError(400, "That isn't a voice memo.");
  if (kind === "photo" && file.size > MAX_PHOTO_BYTES) throw new HttpError(413, "Photo is too large.");
  if (kind === "voice" && file.size > MAX_VOICE_BYTES) throw new HttpError(413, "Voice memo is too large.");

  const duration = Number(form.get("duration")) || null;
  if (kind === "voice" && duration && duration > MAX_VOICE_SECONDS + 5) throw new HttpError(400, "Voice memos max out at 10 minutes.");

  const id = newId();
  const key = `media/${memoryId}/${id}.${extFor(type)}`;
  await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: type } });

  let thumbKey: string | null = null;
  const thumb = form.get("thumb");
  if (kind === "photo" && thumb instanceof File && thumb.size > 0 && thumb.size < 2 * 1024 * 1024) {
    thumbKey = `media/${memoryId}/${id}.thumb.${extFor(thumb.type)}`;
    await env.MEDIA.put(thumbKey, thumb.stream(), { httpMetadata: { contentType: thumb.type || "image/jpeg" } });
  }

  await env.DB.prepare(
    "INSERT INTO media (id, memory_id, kind, r2_key, thumb_key, content_type, width, height, duration_sec, added_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    id, memoryId, kind, key, thumbKey, type,
    Number(form.get("width")) || null, Number(form.get("height")) || null, duration, person
  ).run();
  return json(await memoryDetail(env, memoryId), 201);
}

async function deleteMedia(req: Request, env: Env, mediaId: string) {
  const person = await currentPerson(req, env);
  const row = await env.DB.prepare("SELECT * FROM media WHERE id = ?").bind(mediaId).first<any>();
  if (!row) throw new HttpError(404, "Not found.");
  if (row.added_by !== person) throw new HttpError(403, "Only the person who added this can remove it.");
  await env.MEDIA.delete([row.r2_key, row.thumb_key].filter(Boolean));
  await env.DB.prepare("DELETE FROM media WHERE id = ?").bind(mediaId).run();
  return json(await memoryDetail(env, row.memory_id));
}

// ---------- thoughts ----------

const MAX_THOUGHT_CHARS = 5000;

function checkVoiceFile(file: File | string | null, durationRaw: File | string | null) {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!file.type.startsWith("audio/")) throw new HttpError(400, "That isn't a voice memo.");
  if (file.size > MAX_VOICE_BYTES) throw new HttpError(413, "Voice memo is too large.");
  const duration = Number(durationRaw) || null;
  if (duration && duration > MAX_VOICE_SECONDS + 5) throw new HttpError(400, "Voice memos max out at 10 minutes.");
  return { file, duration };
}

// Anyone can add a thought to any memory, as themselves or as the dog.
async function addThought(req: Request, env: Env, memoryId: string) {
  const person = await currentPerson(req, env);
  await getMemoryRow(env, memoryId);
  const form = await req.formData();
  const author = await resolveAuthor(env, person, (form.get("posted_by") as string) || undefined);
  const text = String(form.get("text") ?? "").trim();
  if (text.length > MAX_THOUGHT_CHARS) throw new HttpError(400, "Keep thoughts under 5,000 characters.");
  const voice = checkVoiceFile(form.get("voice"), form.get("duration"));
  if (!text && !voice) throw new HttpError(400, "Write something or record a voice memo.");

  const id = newId();
  const stmts = [
    env.DB.prepare("INSERT INTO thoughts (id, memory_id, author, text) VALUES (?, ?, ?, ?)").bind(id, memoryId, author, text),
  ];
  if (voice) {
    const mediaId = newId();
    const type = voice.file.type;
    const key = `media/${memoryId}/${mediaId}.${extFor(type)}`;
    await env.MEDIA.put(key, voice.file.stream(), { httpMetadata: { contentType: type } });
    stmts.push(
      env.DB.prepare(
        "INSERT INTO media (id, memory_id, kind, r2_key, content_type, duration_sec, added_by, thought_id) VALUES (?, ?, 'voice', ?, ?, ?, ?, ?)"
      ).bind(mediaId, memoryId, key, type, voice.duration, author, id)
    );
  }
  await env.DB.batch(stmts);
  return json(await memoryDetail(env, memoryId), 201);
}

async function getThought(env: Env, id: string) {
  const row = await env.DB.prepare("SELECT * FROM thoughts WHERE id = ?").bind(id).first<any>();
  if (!row) throw new HttpError(404, "Thought not found.");
  return row;
}

// Thoughts belong to their author. The dog's can be fixed or removed by anyone.
async function updateThought(req: Request, env: Env, id: string) {
  const person = await currentPerson(req, env);
  const row = await getThought(env, id);
  if (!(await canDelete(env, row.author, person))) throw new HttpError(403, "You can only edit your own thoughts.");
  const { text } = await readBody<{ text: string }>(req);
  const clean = (text ?? "").trim();
  if (clean.length > MAX_THOUGHT_CHARS) throw new HttpError(400, "Keep thoughts under 5,000 characters.");
  const hasVoice = await env.DB.prepare("SELECT 1 FROM media WHERE thought_id = ?").bind(id).first();
  if (!clean && !hasVoice) throw new HttpError(400, "A thought can't be empty. Delete it instead.");
  await env.DB.prepare("UPDATE thoughts SET text = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
    .bind(clean, id)
    .run();
  return json(await memoryDetail(env, row.memory_id));
}

async function deleteThought(req: Request, env: Env, id: string) {
  const person = await currentPerson(req, env);
  const row = await getThought(env, id);
  if (!(await canDelete(env, row.author, person))) throw new HttpError(403, "You can only delete your own thoughts.");
  const { results } = await env.DB.prepare("SELECT r2_key FROM media WHERE thought_id = ?").bind(id).all<any>();
  if (results.length) await env.MEDIA.delete(results.map((r) => r.r2_key));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM media WHERE thought_id = ?").bind(id),
    env.DB.prepare("DELETE FROM thoughts WHERE id = ?").bind(id),
  ]);
  return json(await memoryDetail(env, row.memory_id));
}

// Streams a file from R2. Honors Range requests: iPhone Safari won't play audio without them.
async function serveMedia(req: Request, env: Env, mediaId: string, thumb: boolean) {
  const row = await env.DB.prepare("SELECT r2_key, thumb_key, content_type FROM media WHERE id = ?").bind(mediaId).first<any>();
  if (!row) return new Response("Not found", { status: 404 });
  const key = thumb && row.thumb_key ? row.thumb_key : row.r2_key;

  const hasRange = req.headers.has("range");
  const object = await env.MEDIA.get(key, hasRange ? { range: req.headers } : undefined);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "private, max-age=31536000, immutable");
  headers.set("etag", object.httpEtag);

  if (hasRange && object.range && "offset" in object.range) {
    const offset = object.range.offset ?? 0;
    const length = object.range.length ?? object.size - offset;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("content-length", String(length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("content-length", String(object.size));
  return new Response(object.body, { headers });
}

// ---------- router ----------

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  if (path === "/api/session" && method === "GET") {
    return json({ authed: await isAuthed(req, env) });
  }
  if (path === "/api/login" && method === "POST") {
    if (!env.FAMILY_PASSCODE) throw new HttpError(500, "No FAMILY_PASSCODE set.");
    const ip = req.headers.get("cf-connecting-ip") ?? "local";
    if (env.LOGIN_LIMIT && !(await env.LOGIN_LIMIT.limit({ key: ip })).success) {
      throw new HttpError(429, "Too many tries. Wait a minute and try again.");
    }
    const { passcode } = await readBody<{ passcode: string }>(req);
    if ((passcode ?? "").trim() !== env.FAMILY_PASSCODE) throw new HttpError(401, "Wrong passcode.");
    const secure = url.protocol === "https:" ? "; Secure" : "";
    return json({ ok: true }, 200, {
      "set-cookie": `${COOKIE}=${await authToken(env)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ONE_YEAR}${secure}`,
    });
  }
  if (path === "/api/logout" && method === "POST") {
    return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
  }

  if (!(await isAuthed(req, env))) throw new HttpError(401, "Log in first.");

  let m: RegExpMatchArray | null;
  if (path === "/api/world" && method === "GET") return json(await world(env));
  if (path === "/api/people" && method === "POST") return addPerson(req, env);
  if ((m = path.match(/^\/api\/people\/([\w-]+)$/))) {
    if (method === "PUT") return updatePerson(req, env, m[1]);
    if (method === "DELETE") return removePerson(env, m[1]);
  }
  if (path === "/api/memories" && method === "POST") return createMemory(req, env);
  // Ids are letters, digits, and hyphens (sample data uses "sample-m1").
  if ((m = path.match(/^\/api\/memories\/([\w-]+)$/))) {
    if (method === "GET") return json(await memoryDetail(env, m[1]));
    if (method === "PUT") return updateMemory(req, env, m[1]);
    if (method === "DELETE") return deleteMemory(req, env, m[1]);
  }
  if ((m = path.match(/^\/api\/memories\/([\w-]+)\/media$/)) && method === "POST") return addMedia(req, env, m[1]);
  if ((m = path.match(/^\/api\/media\/([\w-]+)$/)) && method === "DELETE") return deleteMedia(req, env, m[1]);
  if ((m = path.match(/^\/api\/memories\/([\w-]+)\/thoughts$/)) && method === "POST") return addThought(req, env, m[1]);
  if ((m = path.match(/^\/api\/thoughts\/([\w-]+)$/))) {
    if (method === "PUT") return updateThought(req, env, m[1]);
    if (method === "DELETE") return deleteThought(req, env, m[1]);
  }
  if ((m = path.match(/^\/media\/([\w-]+)$/)) && method === "GET") {
    return serveMedia(req, env, m[1], url.searchParams.has("thumb"));
  }
  throw new HttpError(404, "Not found.");
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await route(req, env);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: "Something went wrong. Try again." }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
