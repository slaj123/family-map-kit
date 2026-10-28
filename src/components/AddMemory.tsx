import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { formatWhen, isPlan, SEASONS, seasonOf, todayIso } from "../dates";
import { processPhoto, uploadPhoto, uploadVoice, type ProcessedPhoto, type Recording } from "../media";
import { CATEGORIES, type Category, type MemoryDetail, type MemoryInput, type Person, type Place, type Precision } from "../types";
import Face from "./Face";
import PlaceSearch, { reverseName } from "./PlaceSearch";
import VoiceRecorder from "./VoiceRecorder";

const DRAFT_KEY = "fmap.draft";
const NEARBY_METERS = 75;

interface Loc {
  lat: number;
  lng: number;
  name: string;
  placeId?: string;
}

interface Draft {
  step: number;
  title: string;
  category: Category | null;
  location: Loc | null;
  precision: Precision;
  day: string;
  month: number;
  season: number; // index into SEASONS
  year: number;
  // How long it lasted: one moment, a stretch of time, or every year.
  span: "once" | "range" | "repeats";
  endDay: string;
  endMonth: number;
  endSeason: number;
  endYear: number;
  ongoing: boolean;
  people: string[];
  story: string;
  postedBy?: string; // me, or the dog
}

export type AddMode =
  | { kind: "new"; point?: { lat: number; lng: number }; placeId?: string }
  | { kind: "edit"; memory: MemoryDetail };

interface Props {
  mode: AddMode;
  me: string;
  people: Person[];
  places: Place[];
  pickedPoint: { lat: number; lng: number; key: number } | null;
  mapCenter: () => { lat: number; lng: number } | null;
  onRequestPick: () => void;
  onClose: () => void;
  onSaved: (m: MemoryDetail) => void;
}

function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function blankDraft(me: string): Draft {
  const t = new Date();
  return {
    step: 0,
    title: "",
    category: null,
    location: null,
    precision: "day",
    day: todayIso(),
    month: t.getMonth() + 1,
    season: SEASONS.findIndex((s) => s.label === seasonOf(t.getMonth() + 1)),
    year: t.getFullYear(),
    span: "once",
    endDay: todayIso(),
    endMonth: t.getMonth() + 1,
    endSeason: SEASONS.findIndex((s) => s.label === seasonOf(t.getMonth() + 1)),
    endYear: t.getFullYear(),
    ongoing: false,
    people: [me],
    story: "",
  };
}

function draftFromMemory(m: MemoryDetail): Draft {
  const [y, mo] = m.date_start.split("-").map(Number);
  const end = m.date_end ?? m.date_start;
  const [ey, emo] = end.split("-").map(Number);
  return {
    span: m.repeats ? "repeats" : m.date_end || m.ongoing ? "range" : "once",
    endDay: end,
    endMonth: emo,
    endSeason: SEASONS.findIndex((s) => s.label === seasonOf(emo)),
    endYear: ey,
    ongoing: !!m.ongoing,
    step: 0,
    title: m.title,
    category: m.category,
    location: { lat: m.place.lat, lng: m.place.lng, name: m.place.name, placeId: m.place.id },
    precision: m.date_precision,
    day: m.date_start,
    month: mo,
    season: SEASONS.findIndex((s) => s.label === seasonOf(mo)),
    year: y,
    people: m.people,
    story: m.story,
  };
}

function loadDraft(): Draft | null {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
  } catch {
    return null;
  }
}

function saveDraft(d: Draft | null) {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

const hasContent = (d: Draft) => !!(d.title.trim() || d.story.trim() || d.location);

function toIso(precision: Precision, day: string, month: number, season: number, year: number) {
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (precision) {
    case "year":
      return `${year}-01-01`;
    case "season":
      return `${year}-${pad((SEASONS[season] ?? SEASONS[0]).month)}-01`;
    case "month":
      return `${year}-${pad(month)}-01`;
    default:
      return day;
  }
}

const dateStart = (d: Draft) => toIso(d.precision, d.day, d.month, d.season, d.year);

// Repeating memories only need an end year; spans end with the same kind of date they start with.
function dateEnd(d: Draft): string | null {
  if (d.span === "once" || d.ongoing) return null;
  if (d.span === "repeats") return `${d.endYear}-01-01`;
  return toIso(d.precision, d.endDay, d.endMonth, d.endSeason, d.endYear);
}

const whenOf = (d: Draft) => ({
  date_start: dateStart(d),
  date_precision: d.precision,
  date_end: dateEnd(d),
  ongoing: d.span !== "once" && d.ongoing,
  repeats: d.span === "repeats",
});

export default function AddMemory({ mode, me, people, places, pickedPoint, mapCenter, onRequestPick, onClose, onSaved }: Props) {
  const editing = mode.kind === "edit";
  const [draft, setDraftState] = useState<Draft>(() => {
    if (mode.kind === "edit") return draftFromMemory(mode.memory);
    const saved = loadDraft();
    return saved && hasContent(saved) ? { ...blankDraft(me), ...saved } : blankDraft(me);
  });
  const [restored] = useState(() => mode.kind === "new" && !!loadDraft() && hasContent(loadDraft()!));
  const [recording, setRecording] = useState<Recording | null>(null);
  const [photos, setPhotos] = useState<ProcessedPhoto[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [nameLoading, setNameLoading] = useState(false);
  const lastPick = useRef<number | null>(null);

  const steps = editing ? ["What", "Where", "When", "Who", "Story"] : ["What", "Where", "When", "Who", "Story", "Photos"];
  const step = Math.min(draft.step, steps.length - 1);

  const setDraft = (patch: Partial<Draft>) => {
    setError("");
    setDraftState((d) => {
      const next = { ...d, ...patch };
      if (!editing) saveDraft(next);
      return next;
    });
  };

  // Started from a long-press / right-click, or from a place's "Add a memory here".
  useEffect(() => {
    if (mode.kind !== "new") return;
    if (mode.placeId) {
      const p = places.find((x) => x.id === mode.placeId);
      if (p) setDraft({ location: { lat: p.lat, lng: p.lng, name: p.name, placeId: p.id } });
    } else if (mode.point) {
      setPoint(mode.point.lat, mode.point.lng);
    }
  }, []);

  // Came back from "Tap the map".
  useEffect(() => {
    if (pickedPoint && pickedPoint.key !== lastPick.current) {
      lastPick.current = pickedPoint.key;
      setPoint(pickedPoint.lat, pickedPoint.lng);
    }
  }, [pickedPoint?.key]);

  function setPoint(lat: number, lng: number, name = "") {
    setDraft({ location: { lat, lng, name } });
    if (!name) {
      setNameLoading(true);
      reverseName(lat, lng).then((n) => {
        setNameLoading(false);
        setDraftState((d) => {
          if (!d.location || d.location.lat !== lat || d.location.name) return d;
          const next = { ...d, location: { ...d.location, name: n } };
          if (!editing) saveDraft(next);
          return next;
        });
      });
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) return setError("Location isn't available in this browser.");
    setBusy("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy("");
        setPoint(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setBusy("");
        setError("Couldn't get your location. Allow location access, or search instead.");
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  const nearby = draft.location && !draft.location.placeId
    ? places
        .map((p) => ({ p, d: meters(p, draft.location!) }))
        .filter((x) => x.d <= NEARBY_METERS)
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
    : [];

  function validate(i: number): string {
    const name = steps[i];
    if (name === "What") {
      if (!draft.title.trim()) return "Give it a title.";
      if (!draft.category) return "Pick a category.";
    }
    if (name === "Where") {
      if (!draft.location) return "Pick where it happened.";
      if (!draft.location.name.trim()) return "Name this place.";
    }
    if (name === "When") {
      if (draft.precision === "day" && !/^\d{4}-\d{2}-\d{2}$/.test(draft.day)) return "Pick a date.";
      if (draft.precision !== "day" && (!draft.year || draft.year < 1900 || draft.year > 2100)) return "Enter a year.";
      if (draft.span === "repeats" && draft.precision === "year") return "Pick a season, month, or day to repeat.";
      const end = dateEnd(draft);
      if (end) {
        if (draft.span === "range" && draft.precision === "day" && !/^\d{4}-\d{2}-\d{2}$/.test(draft.endDay)) return "Pick an end date.";
        if ((draft.span === "repeats" || draft.precision !== "day") && (!draft.endYear || draft.endYear < 1900 || draft.endYear > 2100)) return "Enter an end year.";
        const cmp = draft.span === "repeats" ? [end.slice(0, 4), dateStart(draft).slice(0, 4)] : [end, dateStart(draft)];
        if (cmp[0] < cmp[1]) return "The end can't be before the start.";
      }
    }
    if (name === "Who" && draft.people.length === 0) return "Tap at least one person.";
    return "";
  }

  function next() {
    const problem = validate(step);
    if (problem) return setError(problem);
    setDraft({ step: step + 1 });
  }

  async function save() {
    for (let i = 0; i < steps.length; i++) {
      const problem = validate(i);
      if (problem) {
        setDraft({ step: i });
        setError(problem);
        return;
      }
    }
    const loc = draft.location!;
    const author = draft.postedBy && pets.some((p) => p.id === draft.postedBy) ? draft.postedBy : me;
    const input: MemoryInput = {
      place: loc.placeId ? { id: loc.placeId } : { name: loc.name.trim(), lat: loc.lat, lng: loc.lng },
      title: draft.title.trim(),
      category: draft.category!,
      ...whenOf(draft),
      story: draft.story,
      people: author !== me && !draft.people.includes(author) ? [...draft.people, author] : draft.people,
      ...(editing ? {} : { posted_by: author }),
    };
    setError("");
    try {
      setBusy("Saving…");
      let saved = editing ? await api.updateMemory(mode.memory.id, input) : await api.createMemory(input);
      if (!editing) saveDraft(null);
      if (recording) {
        setBusy("Saving voice memo…");
        saved = await uploadVoice(saved.id, recording);
      }
      for (let i = 0; i < photos.length; i++) {
        setBusy(`Uploading photo ${i + 1} of ${photos.length}…`);
        saved = await uploadPhoto(saved.id, photos[i]);
      }
      onSaved(saved);
    } catch (e: any) {
      setBusy("");
      setError(e.message);
    }
  }

  async function addPhotoFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files];
    for (let i = 0; i < list.length; i++) {
      setBusy(`Preparing photo ${i + 1} of ${list.length}…`);
      try {
        const p = await processPhoto(list[i]);
        setPhotos((prev) => [...prev, p]);
      } catch (e: any) {
        setError(e.message);
      }
    }
    setBusy("");
  }

  function startOver() {
    saveDraft(null);
    setDraftState(blankDraft(me));
    setRecording(null);
    setPhotos([]);
  }

  const humans = people.filter((p) => p.kind === "person");
  const pets = people.filter((p) => p.kind === "pet");
  const asPet = pets.find((p) => p.id === draft.postedBy);
  const everyone = humans.every((p) => draft.people.includes(p.id));
  const planNote = isPlan(dateStart(draft));
  const last = step === steps.length - 1;

  return (
    <div className="sheet-backdrop">
      <div className="sheet add-sheet" role="dialog" aria-label={editing ? "Edit memory" : "New memory"}>
        <header className="add-head">
          <div>
            <p className="eyebrow">{editing ? "Edit memory" : "New memory"} · {step + 1} of {steps.length}</p>
            <h2 className="display">{STEP_TITLES[steps[step]]}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={editing ? "Close without saving" : "Close. Your draft is saved."}>×</button>
        </header>
        <div className="progress" aria-hidden="true">
          {steps.map((s, i) => <span key={s} className={i <= step ? "is-on" : ""} />)}
        </div>
        {restored && (
          <p className="draft-note">Picked up your draft. <button className="btn-link" onClick={startOver}>Start over</button></p>
        )}

        <div className="add-body">
          {steps[step] === "What" && (
            <>
              <label className="field">
                <span>Title</span>
                <input
                  value={draft.title}
                  maxLength={120}
                  placeholder="Grandma's 80th birthday"
                  onChange={(e) => setDraft({ title: e.target.value })}
                  autoFocus
                />
              </label>
              <div className="field">
                <span>Category</span>
                <div className="cat-grid">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`cat-choice${draft.category === c.id ? " is-on" : ""}`}
                      style={{ "--chip": c.color } as React.CSSProperties}
                      onClick={() => setDraft({ category: c.id })}
                      aria-pressed={draft.category === c.id}
                    >
                      <span className="dot" />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {steps[step] === "Where" && (
            <>
              {draft.location ? (
                <div className="loc-card">
                  {draft.location.placeId ? (
                    <p className="loc-name"><strong>{draft.location.name}</strong><span className="muted"> · existing place</span></p>
                  ) : (
                    <label className="field">
                      <span>Place name</span>
                      <input
                        value={draft.location.name}
                        placeholder={nameLoading ? "Looking up…" : "Name this spot"}
                        onChange={(e) => setDraft({ location: { ...draft.location!, name: e.target.value } })}
                      />
                    </label>
                  )}
                  <p className="muted small">{draft.location.lat.toFixed(5)}, {draft.location.lng.toFixed(5)}</p>
                  {nearby.length > 0 && (
                    <div className="nearby">
                      <p className="small">Already a pin right here:</p>
                      {nearby.map(({ p }) => (
                        <button key={p.id} type="button" className="btn nearby-btn"
                          onClick={() => setDraft({ location: { lat: p.lat, lng: p.lng, name: p.name, placeId: p.id } })}>
                          Add to {p.name} ({p.memories.length} {p.memories.length === 1 ? "memory" : "memories"})
                        </button>
                      ))}
                    </div>
                  )}
                  <button type="button" className="btn-link" onClick={() => setDraft({ location: null })}>Change location</button>
                </div>
              ) : (
                <>
                  <PlaceSearch near={mapCenter()} onPick={(p) => setPoint(p.lat, p.lng, p.name)} />
                  <div className="or">or</div>
                  <div className="row">
                    <button type="button" className="btn" onClick={onRequestPick}>Tap the map</button>
                    <button type="button" className="btn" onClick={useMyLocation}>I'm here</button>
                  </div>
                </>
              )}
            </>
          )}

          {steps[step] === "When" && (
            <>
              <div className="segmented wide" role="group" aria-label="How exact is the date">
                {(["day", "month", "season", "year"] as const).map((p) => (
                  <button key={p} type="button" className={draft.precision === p ? "is-on" : ""} onClick={() => setDraft({ precision: p })}>
                    {p === "day" ? "Exact day" : p[0].toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
              <div className="field">
                {draft.span !== "once" && <span>{draft.span === "repeats" ? "First time" : "Start"}</span>}
                <DateFields precision={draft.precision} day={draft.day} month={draft.month} season={draft.season} year={draft.year}
                  onChange={(p) => setDraft(p)} />
              </div>

              <div className="field">
                <span>How long?</span>
                <div className="segmented wide" role="group" aria-label="How long">
                  {([["once", "One time"], ["range", "Span of time"], ["repeats", "Every year"]] as const).map(([id, label]) => (
                    <button key={id} type="button" className={draft.span === id ? "is-on" : ""}
                      onClick={() => setDraft({ span: id, ...(id === "repeats" && draft.precision === "year" ? { precision: "season" as Precision } : {}) })}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {draft.span === "range" && (
                <div className="field">
                  <span>End</span>
                  {!draft.ongoing && (
                    <DateFields precision={draft.precision} day={draft.endDay} month={draft.endMonth} season={draft.endSeason} year={draft.endYear}
                      onChange={(p) => setDraft({
                        ...(p.day !== undefined ? { endDay: p.day } : {}),
                        ...(p.month !== undefined ? { endMonth: p.month } : {}),
                        ...(p.season !== undefined ? { endSeason: p.season } : {}),
                        ...(p.year !== undefined ? { endYear: p.year } : {}),
                      })} />
                  )}
                  <label className="check"><input type="checkbox" checked={draft.ongoing} onChange={(e) => setDraft({ ongoing: e.target.checked })} /> Still going</label>
                </div>
              )}

              {draft.span === "repeats" && (
                <div className="field">
                  <span>Last time</span>
                  {!draft.ongoing && (
                    <input type="number" inputMode="numeric" min={1900} max={2100} value={draft.endYear || ""} className="year-input plain-input"
                      onChange={(e) => setDraft({ endYear: Number(e.target.value) })} aria-label="Last year" />
                  )}
                  <label className="check"><input type="checkbox" checked={draft.ongoing} onChange={(e) => setDraft({ ongoing: e.target.checked })} /> Still happening</label>
                </div>
              )}

              <p className="when-preview">
                <span className={`stamp stamp-lg${planNote ? " is-plan" : ""}`}>
                  {planNote && <span className="stamp-top">Plan</span>}
                  {formatWhen(whenOf(draft))}
                </span>
                {planNote && <span className="muted small">Starts in the future, so it'll be a plan with a hollow pin.</span>}
              </p>
            </>
          )}

          {steps[step] === "Who" && (
            <>
              <div className="who-grid">
                {people.map((p) => (
                  <Face key={p.id} person={p} size="lg" showName active={draft.people.includes(p.id)}
                    onClick={() => setDraft({ people: draft.people.includes(p.id) ? draft.people.filter((x) => x !== p.id) : [...draft.people, p.id] })} />
                ))}
              </div>
              <button type="button" className="btn-link"
                onClick={() => setDraft({ people: everyone ? [me] : [...new Set([...draft.people, ...humans.map((h) => h.id)])] })}>
                {everyone ? "Just me" : "Whole family"}
              </button>
            </>
          )}

          {steps[step] === "Story" && (
            <>
              {!editing && pets.length > 0 && (
                <div className="field">
                  <span>Who's telling it?</span>
                  <div className="segmented wide" role="group" aria-label="Who's telling it">
                    {[people.find((p) => p.id === me)!, ...pets].map((p) => (
                      <button key={p.id} type="button" className={(draft.postedBy ?? me) === p.id ? "is-on" : ""}
                        onClick={() => setDraft({ postedBy: p.id })}>
                        {p.id === me ? `Me (${p.name})` : p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <label className="field">
                <span>What happened</span>
                <textarea
                  rows={7}
                  value={draft.story}
                  placeholder={asPet ? `Woof. Tell it the way ${asPet.name} would.` : "Write it the way you'd tell it at dinner."}
                  onChange={(e) => setDraft({ story: e.target.value })}
                />
              </label>
              {!editing && (
                <div className="field">
                  <span>Or tell it out loud</span>
                  <VoiceRecorder value={recording} onChange={setRecording} />
                  {recording && <p className="muted small">Voice memos aren't kept in drafts. Save the memory to keep it.</p>}
                </div>
              )}
            </>
          )}

          {steps[step] === "Photos" && (
            <>
              <p className="muted">Optional. You or anyone in this memory can add more later.</p>
              <label className="btn file-btn">
                Choose photos
                <input type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(e) => { addPhotoFiles(e.target.files); e.target.value = ""; }} />
              </label>
              {photos.length > 0 && (
                <div className="photo-grid">
                  {photos.map((p, i) => (
                    <div key={p.previewUrl} className="photo-tile">
                      <img src={p.previewUrl} alt="" />
                      <button type="button" className="photo-remove" aria-label="Remove photo"
                        onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {busy && <p className="muted">{busy}</p>}
          {error && <p className="error">{error}</p>}
        </div>

        <footer className="add-foot">
          {step > 0 ? (
            <button type="button" className="btn" onClick={() => setDraft({ step: step - 1 })} disabled={!!busy}>Back</button>
          ) : <span />}
          {last ? (
            <button type="button" className="btn btn-ink" onClick={save} disabled={!!busy}>
              {editing ? "Save changes" : "Save memory"}
            </button>
          ) : (
            <button type="button" className="btn btn-ink" onClick={next} disabled={!!busy}>
              {steps[step] === "Story" && !editing && !draft.story.trim() && !recording ? "Skip" : "Next"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

const STEP_TITLES: Record<string, string> = {
  What: "What was it?",
  Where: "Where?",
  When: "When?",
  Who: "Who was there?",
  Story: "Tell the story",
  Photos: "Add photos",
};

interface DateParts {
  day?: string;
  month?: number;
  season?: number;
  year?: number;
}

// The inputs for one date at the chosen precision: a date picker, month + year, season + year, or year.
function DateFields({ precision, day, month, season, year, onChange }: { precision: Precision; day: string; month: number; season: number; year: number; onChange: (p: DateParts) => void }) {
  return (
    <div className="when-fields">
      {precision === "day" && <input type="date" value={day} onChange={(e) => onChange({ day: e.target.value })} aria-label="Date" />}
      {precision === "month" && (
        <select value={month} onChange={(e) => onChange({ month: Number(e.target.value) })} aria-label="Month">
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={i + 1}>{new Date(2000, i, 1).toLocaleString("en-US", { month: "long" })}</option>
          ))}
        </select>
      )}
      {precision === "season" && (
        <select value={season} onChange={(e) => onChange({ season: Number(e.target.value) })} aria-label="Season">
          {SEASONS.map((s, i) => <option key={s.id} value={i}>{s.label}</option>)}
        </select>
      )}
      {precision !== "day" && (
        <input type="number" inputMode="numeric" min={1900} max={2100} value={year || ""}
          onChange={(e) => onChange({ year: Number(e.target.value) })} aria-label="Year" className="year-input" />
      )}
    </div>
  );
}
