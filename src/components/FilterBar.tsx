import { useState } from "react";
import { CATEGORIES, type Category, type Person } from "../types";
import Face from "./Face";

export type TimeFilter = "all" | "past" | "plans";

export interface Filters {
  people: string[];
  // tagged: memories ALL of these people were in. added: memories ANY of them posted.
  peopleMode: "tagged" | "added";
  categories: Category[]; // empty = every category
  time: TimeFilter;
  query: string;
}

export const EMPTY_FILTERS: Filters = { people: [], peopleMode: "tagged", categories: [], time: "all", query: "" };

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

interface Props {
  people: Person[];
  filters: Filters;
  onChange: (f: Filters) => void;
  shown: number;
  total: number;
}

// Phones: one row (search + Filters button) that opens into every filter, wrapped so nothing hides
// off the edge. Computers: everything stays open.
export default function FilterBar({ people, filters, onChange, shown, total }: Props) {
  const [open, setOpen] = useState(false);
  const count = filters.people.length + filters.categories.length + (filters.time !== "all" ? 1 : 0);
  const active = count > 0 || filters.query.trim() !== "";

  return (
    <div className={`filters${open ? " is-open" : ""}`}>
      <div className="filter-row">
        <label className="search">
          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="m11 11 4 4" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          <input
            type="search"
            placeholder="Search memories and places"
            value={filters.query}
            onChange={(e) => onChange({ ...filters, query: e.target.value })}
            aria-label="Search memories and places"
          />
        </label>
        <button type="button" className={`filter-toggle${count ? " has-count" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Done" : count ? `Filters · ${count}` : "Filters"}
        </button>
      </div>

      <div className="filter-body">
        <div className="filter-group">
          <span className="filter-label">Who</span>
          <div className="face-row" role="group" aria-label="Filter by person">
            {people.map((p) => (
              <Face
                key={p.id}
                person={p}
                size="md"
                active={filters.people.includes(p.id)}
                onClick={() => onChange({ ...filters, people: toggle(filters.people, p.id) })}
              />
            ))}
          </div>
          {filters.people.length > 0 && (
            <div className="segmented" role="group" aria-label="Match people by">
              {([["tagged", "Was there"], ["added", "Added by"]] as const).map(([id, label]) => (
                <button key={id} type="button" className={filters.peopleMode === id ? "is-on" : ""} aria-pressed={filters.peopleMode === id}
                  onClick={() => onChange({ ...filters, peopleMode: id })}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="filter-group">
          <span className="filter-label">When</span>
          <div className="segmented" role="group" aria-label="Past or plans">
            {(["all", "past", "plans"] as const).map((t) => (
              <button key={t} type="button" className={filters.time === t ? "is-on" : ""} aria-pressed={filters.time === t}
                onClick={() => onChange({ ...filters, time: t })}>
                {t === "all" ? "All" : t === "past" ? "Past" : "Plans"}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <span className="filter-label">What</span>
          <div className="chip-wrap">
            {CATEGORIES.map((c) => {
              const on = filters.categories.includes(c.id);
              return (
                <button key={c.id} type="button" className={`chip${on ? " is-on" : ""}`} style={{ "--chip": c.color } as React.CSSProperties}
                  aria-pressed={on} onClick={() => onChange({ ...filters, categories: toggle(filters.categories, c.id) })}>
                  <span className="dot" aria-hidden="true" />
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {active && (
          <button type="button" className="chip chip-clear" onClick={() => onChange(EMPTY_FILTERS)}>
            Clear all · showing {shown} of {total}
          </button>
        )}
      </div>
    </div>
  );
}
