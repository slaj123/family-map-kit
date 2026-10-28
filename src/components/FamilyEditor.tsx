import { useState } from "react";
import { api, ApiError } from "../api";
import type { Person } from "../types";
import Face from "./Face";

interface Props {
  people: Person[];
  onChanged: () => Promise<void> | void; // reload the world after any change
  onClose?: () => void; // omitted on first run, when there's no one to close back to
  title?: string;
  intro?: string;
}

// Add family members and pets, rename them, or remove someone who isn't in any memory yet.
export default function FamilyEditor({ people, onChanged, onClose, title = "Your family", intro }: Props) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Person["kind"]>("person");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", initial: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await onChanged();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const add = async () => {
    if (!name.trim()) return setError("Type a name first.");
    if (await run(() => api.addPerson({ name, kind }))) setName("");
  };

  return (
    <div className="gate family-editor" role="dialog" aria-label={title}>
      <div className="gate-card">
        <h1 className="display">{title}</h1>
        {intro && <p className="muted">{intro}</p>}

        <ul className="family-list">
          {people.map((p) =>
            editing === p.id ? (
              <li key={p.id} className="family-row editing">
                <input aria-label="Name" value={draft.name} maxLength={30} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                <input aria-label="Letter on the map" className="initial-input" value={draft.initial} maxLength={2}
                  onChange={(e) => setDraft({ ...draft, initial: e.target.value })} />
                <button className="btn btn-ink" disabled={busy}
                  onClick={async () => { if (await run(() => api.updatePerson(p.id, draft))) setEditing(null); }}>Save</button>
                <button className="btn-link" onClick={() => setEditing(null)}>Cancel</button>
              </li>
            ) : (
              <li key={p.id} className="family-row">
                <Face person={p} size="md" />
                <span className="family-name">{p.name}{p.kind === "pet" ? <span className="muted"> · pet</span> : null}</span>
                <button className="btn-link" onClick={() => { setEditing(p.id); setDraft({ name: p.name, initial: p.initial }); setError(""); }}>Rename</button>
                <button className="btn-link danger" disabled={busy}
                  onClick={() => confirm(`Remove ${p.name} from the family list?`) && run(() => api.removePerson(p.id))}>Remove</button>
              </li>
            )
          )}
        </ul>

        <div className="field">
          <span>Add someone</span>
          <div className="family-add">
            <input placeholder="Name" value={name} maxLength={30} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()} />
            <div className="segmented" role="group" aria-label="Person or pet">
              {(["person", "pet"] as const).map((k) => (
                <button key={k} type="button" className={kind === k ? "is-on" : ""} aria-pressed={kind === k} onClick={() => setKind(k)}>
                  {k === "person" ? "Person" : "Pet"}
                </button>
              ))}
            </div>
            <button className="btn btn-ink" disabled={busy} onClick={add}>Add</button>
          </div>
        </div>

        {error && <p className="error" role="alert">{error}</p>}
        {onClose && <button className="btn" onClick={onClose}>Done</button>}
      </div>
    </div>
  );
}
