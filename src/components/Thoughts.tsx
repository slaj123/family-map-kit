import { useState } from "react";
import { api, mediaUrl } from "../api";
import { addedOn } from "../dates";
import { formatDuration, type Recording } from "../media";
import type { MemoryDetail, Person, Thought } from "../types";
import Face from "./Face";
import VoiceRecorder from "./VoiceRecorder";

interface Props {
  memory: MemoryDetail;
  people: Person[];
  me: string;
  onUpdate: (m: MemoryDetail) => void;
}

// Everyone's own take on a memory: typed, spoken, or both. Oldest first, like a conversation.
export default function Thoughts({ memory, people, me, onUpdate }: Props) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const pets = people.filter((p) => p.kind === "pet");
  const [text, setText] = useState("");
  const [recording, setRecording] = useState<Recording | null>(null);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [author, setAuthor] = useState(me);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const canManage = (t: Thought) => t.author === me || byId.get(t.author)?.kind === "pet";
  const asPet = pets.find((p) => p.id === author);

  async function post() {
    if (!text.trim() && !recording) return setError("Write something or record a voice memo.");
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("text", text);
    if (author !== me) form.set("posted_by", author);
    if (recording) {
      const ext = recording.type.includes("mp4") ? "m4a" : recording.type.includes("webm") ? "webm" : "ogg";
      form.set("voice", new File([recording.blob], `thought.${ext}`, { type: recording.type.split(";")[0] }));
      form.set("duration", String(Math.round(recording.duration)));
    }
    try {
      onUpdate(await api.addThought(memory.id, form));
      setText("");
      setRecording(null);
      setRecorderOpen(false);
      setAuthor(me);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: string) {
    try {
      onUpdate(await api.updateThought(id, editText));
      setEditingId(null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function remove(t: Thought) {
    if (!confirm("Delete this thought? This can't be undone.")) return;
    try {
      onUpdate(await api.deleteThought(t.id));
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <section className="detail-section thoughts">
      <h3 className="section-label">Thoughts</h3>
      {memory.thoughts.length === 0 && <p className="muted small">No one's added their side yet.</p>}
      <ol className="thought-list">
        {memory.thoughts.map((t) => {
          const who = byId.get(t.author);
          return (
            <li key={t.id} className="thought">
              {who && <Face person={who} size="sm" />}
              <div className="thought-body">
                <p className="thought-meta">
                  <strong>{who?.name ?? "Someone"}</strong>
                  <span className="muted"> · {addedOn(t.created_at)}{t.updated_at !== t.created_at ? " · edited" : ""}</span>
                </p>
                {editingId === t.id ? (
                  <>
                    <textarea className="thought-input" rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
                    <div className="row">
                      <button className="btn btn-ink" onClick={() => saveEdit(t.id)}>Save</button>
                      <button className="btn-link" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </>
                ) : (
                  t.text && <p className="thought-text">{t.text}</p>
                )}
                {t.voice && (
                  <div className="voice-item">
                    <audio controls preload="none" src={mediaUrl(t.voice.id)} />
                    {t.voice.duration_sec ? <span className="muted small">{formatDuration(t.voice.duration_sec)}</span> : null}
                  </div>
                )}
                {canManage(t) && editingId !== t.id && (
                  <div className="row thought-actions">
                    <button className="btn-link" onClick={() => { setEditingId(t.id); setEditText(t.text); }}>Edit</button>
                    <button className="btn-link danger" onClick={() => remove(t)}>Delete</button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="composer">
        {pets.length > 0 && (
          <div className="segmented" role="group" aria-label="Who's thinking">
            {[byId.get(me)!, ...pets].map((p) => (
              <button key={p.id} type="button" className={author === p.id ? "is-on" : ""} onClick={() => setAuthor(p.id)}>
                {p.id === me ? `Me (${p.name})` : p.name}
              </button>
            ))}
          </div>
        )}
        <textarea
          className="thought-input"
          rows={3}
          value={text}
          placeholder={asPet ? `What does ${asPet.name} remember?` : "Add your side of it"}
          onChange={(e) => {
            setText(e.target.value);
            setError("");
          }}
        />
        {recorderOpen && <VoiceRecorder value={recording} onChange={setRecording} />}
        <div className="row composer-actions">
          {!recorderOpen && (
            <button type="button" className="btn" onClick={() => setRecorderOpen(true)}>Record voice</button>
          )}
          <button type="button" className="btn btn-ink" onClick={post} disabled={busy}>
            {busy ? "Posting…" : "Post thought"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </section>
  );
}
