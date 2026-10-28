import { useState } from "react";
import { mediaUrl } from "../api";
import { addedOn, formatWhen, isPlan, stampParts } from "../dates";
import { categoryColor, categoryLabel, type MemorySummary, type Person, type Place } from "../types";
import Face from "./Face";

type Sort = "added" | "date";
const SORT_KEY = "fmap.listSort";

function savedSort(): Sort {
  try {
    return localStorage.getItem(SORT_KEY) === "date" ? "date" : "added";
  } catch {
    return "added";
  }
}

interface Props {
  items: { memory: MemorySummary; place: Place }[];
  people: Person[];
  selectedId: string | null;
  onOpen: (memoryId: string, placeId: string) => void;
  emptyText: string;
}

// Every memory that passes the filters, as a scrollable feed. No map.
export default function ListView({ items, people, selectedId, onOpen, emptyText }: Props) {
  const [sort, setSort] = useState<Sort>(savedSort);
  const byId = new Map(people.map((p) => [p.id, p]));

  const sorted = [...items].sort((a, b) =>
    sort === "added"
      ? b.memory.created_at.localeCompare(a.memory.created_at)
      : b.memory.date_start.localeCompare(a.memory.date_start)
  );

  function changeSort(s: Sort) {
    setSort(s);
    try {
      localStorage.setItem(SORT_KEY, s);
    } catch {}
  }

  return (
    <div className="list-view">
      <div className="list-inner">
        <div className="list-head">
          <p className="eyebrow">{sorted.length === 1 ? "1 memory" : `${sorted.length} memories`}</p>
          <div className="segmented" role="group" aria-label="Sort">
            <button type="button" className={sort === "added" ? "is-on" : ""} onClick={() => changeSort("added")}>Recently added</button>
            <button type="button" className={sort === "date" ? "is-on" : ""} onClick={() => changeSort("date")}>By date</button>
          </div>
        </div>

        {sorted.length === 0 && <p className="muted list-empty">{emptyText}</p>}

        <ol className="feed">
          {sorted.map(({ memory: m, place }) => {
            const plan = isPlan(m.date_start);
            const stamp = stampParts(m);
            const author = byId.get(m.created_by);
            return (
              <li key={m.id}>
                <button
                  className={`feed-card${plan ? " is-plan" : ""}${m.id === selectedId ? " is-selected" : ""}`}
                  style={{ "--cat": categoryColor(m.category) } as React.CSSProperties}
                  onClick={() => onOpen(m.id, place.id)}
                >
                  {m.cover && <img className="feed-cover" src={mediaUrl(m.cover, true)} alt="" loading="lazy" />}
                  <span className="feed-body">
                    <span className="feed-top">
                      <span className="stamp" title={formatWhen(m)}>
                        {(plan || stamp.top) && (
                          <span className="stamp-top">{[plan && "Plan", stamp.top].filter(Boolean).join(" · ")}</span>
                        )}
                        {stamp.main}
                      </span>
                      <span className="cat-label">{categoryLabel(m.category)}</span>
                    </span>
                    <span className="feed-title">{m.title}</span>
                    <span className="feed-place">{place.name}</span>
                    <span className="feed-foot">
                      <span className="face-stack">
                        {people.filter((p) => m.people.includes(p.id)).map((p) => <Face key={p.id} person={p} size="sm" />)}
                      </span>
                      <span className="feed-meta">
                        {m.photos > 0 && <span>{m.photos} photo{m.photos > 1 ? "s" : ""}</span>}
                        {m.thoughts > 0 && <span>{m.thoughts} thought{m.thoughts > 1 ? "s" : ""}</span>}
                        <span>Added by {author?.name ?? "someone"} · {addedOn(m.created_at)}</span>
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
