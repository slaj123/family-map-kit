import { formatWhen, isPlan, stampParts } from "../dates";
import { categoryColor, categoryLabel, type Person, type Place } from "../types";
import Face from "./Face";

interface Props {
  place: Place;
  people: Person[];
  onOpen: (memoryId: string) => void;
  onAddHere: () => void;
  onClose: () => void;
}

// A place's memories, oldest first, each with a passport-style date stamp.
export default function PlacePanel({ place, people, onOpen, onAddHere, onClose }: Props) {
  const memories = [...place.memories].sort((a, b) => a.date_start.localeCompare(b.date_start));

  return (
    <>
      <header className="panel-head">
        <div>
          <p className="eyebrow">{memories.length === 1 ? "1 memory" : `${memories.length} memories`}</p>
          <h2 className="display panel-title">{place.name}</h2>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
      </header>
      <ol className="memory-list">
        {memories.map((m) => {
          const plan = isPlan(m.date_start);
          const color = categoryColor(m.category);
          return (
            <li key={m.id}>
              <button className={`memory-card${plan ? " is-plan" : ""}`} onClick={() => onOpen(m.id)} style={{ "--cat": color } as React.CSSProperties}>
                <span className="stamp" title={formatWhen(m)}>
                  {(plan || stampParts(m).top) && (
                    <span className="stamp-top">{[plan && "Plan", stampParts(m).top].filter(Boolean).join(" · ")}</span>
                  )}
                  {stampParts(m).main}
                </span>
                <span className="memory-card-body">
                  <span className="memory-card-title">{m.title}</span>
                  <span className="memory-card-meta">
                    <span className="cat-label">{categoryLabel(m.category)}</span>
                    {m.photos > 0 && <span>{m.photos} photo{m.photos > 1 ? "s" : ""}</span>}
                    {m.voices > 0 && <span>{m.voices} voice memo{m.voices > 1 ? "s" : ""}</span>}
                    {m.thoughts > 0 && <span>{m.thoughts} thought{m.thoughts > 1 ? "s" : ""}</span>}
                  </span>
                  <span className="face-stack">
                    {people.filter((p) => m.people.includes(p.id)).map((p) => <Face key={p.id} person={p} size="sm" />)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="panel-foot">
        <button className="btn" onClick={onAddHere}>Add a memory here</button>
      </div>
    </>
  );
}
