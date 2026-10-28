import { useEffect, useRef, useState } from "react";
import { api, mediaUrl } from "../api";
import { addedOn, formatWhen, isPlan } from "../dates";
import { formatDuration, processPhoto, uploadPhoto } from "../media";
import { categoryColor, categoryLabel, type MemoryDetail as Detail, type Person } from "../types";
import Face from "./Face";
import Lightbox from "./Lightbox";
import Thoughts from "./Thoughts";

interface Props {
  memoryId: string;
  people: Person[];
  me: string;
  onBack: () => void;
  onEdit: (m: Detail) => void;
  onChanged: () => void;
  onDeleted: () => void;
  backLabel?: string; // defaults to the place name
  onShowOnMap?: () => void;
}

export default function MemoryDetail({ memoryId, people, me, onBack, onEdit, onChanged, onDeleted, backLabel, onShowOnMap }: Props) {
  const [memory, setMemory] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const byId = new Map(people.map((p) => [p.id, p]));

  useEffect(() => {
    setMemory(null);
    setError("");
    api.memory(memoryId).then(setMemory).catch((e) => setError(e.message));
  }, [memoryId]);

  if (error && !memory) {
    return (
      <div className="panel-body">
        <button className="btn-link" onClick={onBack}>← Back</button>
        <p className="error">{error}</p>
      </div>
    );
  }
  if (!memory) return <div className="panel-body muted">Loading…</div>;

  // Anyone can add to or edit any memory. Delete: whoever posted it, or anyone for the dog's posts.
  const canDelete = memory.created_by === me || byId.get(memory.created_by)?.kind === "pet";
  const plan = isPlan(memory.date_start);
  const photos = memory.media.filter((m) => m.kind === "photo");
  const voices = memory.media.filter((m) => m.kind === "voice");
  const name = (id: string) => byId.get(id)?.name ?? "Someone";

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const list = [...files];
    let latest: Detail | null = null;
    for (let i = 0; i < list.length; i++) {
      setBusy(`Adding photo ${i + 1} of ${list.length}…`);
      try {
        latest = await uploadPhoto(memoryId, await processPhoto(list[i]));
        setMemory(latest);
      } catch (e: any) {
        setError(e.message);
      }
    }
    setBusy("");
    if (fileInput.current) fileInput.current.value = "";
    if (latest) onChanged();
  }

  async function removeMedia(id: string, label: string) {
    if (!confirm(`Remove this ${label}? This can't be undone.`)) return;
    try {
      setMemory(await api.deleteMedia(id));
      setLightbox(null);
      onChanged();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${memory!.title}" and all its photos, voice memos, and thoughts? This can't be undone.`)) return;
    try {
      await api.deleteMemory(memoryId);
      onDeleted();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const shown = lightbox !== null ? photos[lightbox] : null;

  return (
    <div className="panel-body" style={{ "--cat": categoryColor(memory.category) } as React.CSSProperties}>
      <div className="detail-top">
        <button className="btn-link" onClick={onBack}>← {backLabel ?? memory.place.name}</button>
        {onShowOnMap && <button className="btn-link" onClick={onShowOnMap}>See on map</button>}
      </div>
      <div className="detail-head">
        <span className={`stamp stamp-lg${plan ? " is-plan" : ""}`}>
          {plan && <span className="stamp-top">Plan</span>}
          {formatWhen(memory)}
        </span>
        <h2 className="display detail-title">{memory.title}</h2>
        <p className="cat-label">{categoryLabel(memory.category)}</p>
      </div>

      <div className="detail-people">
        {people.filter((p) => memory.people.includes(p.id)).map((p) => (
          <Face key={p.id} person={p} size="sm" showName />
        ))}
      </div>

      {memory.story && <div className="story">{memory.story}</div>}

      {voices.length > 0 && (
        <section className="detail-section">
          {voices.map((v) => (
            <div key={v.id} className="voice-item">
              <audio controls preload="none" src={mediaUrl(v.id)} />
              <div className="credit">
                Told by {name(v.added_by)}{v.duration_sec ? ` · ${formatDuration(v.duration_sec)}` : ""}
                {v.added_by === me && (
                  <button className="btn-link danger" onClick={() => removeMedia(v.id, "voice memo")}>Remove</button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {photos.length > 0 && (
        <section className="detail-section">
          <h3 className="section-label">Photos</h3>
          <div className="photo-grid">
            {photos.map((p, i) => (
              <button key={p.id} className="photo-tile" onClick={() => setLightbox(i)}>
                <img src={mediaUrl(p.id, !!p.has_thumb)} alt="" loading="lazy" />
                <span className="photo-credit">Added by {name(p.added_by)} · {addedOn(p.added_at)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="row">
        <button className="btn" onClick={() => fileInput.current?.click()} disabled={!!busy}>Add photos</button>
        <input ref={fileInput} type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
      </div>
      {busy && <p className="muted">{busy}</p>}
      {error && <p className="error">{error}</p>}

      <Thoughts memory={memory} people={people} me={me} onUpdate={(m) => { setMemory(m); onChanged(); }} />

      <footer className="detail-foot">
        <span className="muted">Added by {name(memory.created_by)}</span>
        <span className="row">
          <button className="btn-link" onClick={() => onEdit(memory)}>Edit</button>
          {canDelete && <button className="btn-link danger" onClick={remove}>Delete</button>}
        </span>
      </footer>

      {shown && (
        <Lightbox
          photos={photos}
          index={lightbox!}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
          caption={(p) => `Added by ${name(p.added_by)} · ${addedOn(p.added_at)}`}
          canRemove={(p) => p.added_by === me}
          onRemove={(p) => removeMedia(p.id, "photo")}
        />
      )}
    </div>
  );
}
