import type { Person } from "../types";
import Face from "./Face";

export default function WhoAreYou({ people, onPick, onEditFamily }: { people: Person[]; onPick: (id: string) => void; onEditFamily: () => void }) {
  const humans = people.filter((p) => p.kind === "person");
  return (
    <div className="gate">
      <div className="gate-card">
        <p className="eyebrow">One-time setup on this device</p>
        <h1 className="display">Who are you?</h1>
        <p className="muted">Everything you add from this device will be credited to you.</p>
        <div className="who-grid">
          {humans.map((p) => (
            <Face key={p.id} person={p} size="lg" showName onClick={() => onPick(p.id)} />
          ))}
        </div>
        <button className="btn-link" onClick={onEditFamily}>Not listed? Add or edit family members</button>
      </div>
    </div>
  );
}
