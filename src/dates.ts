import type { Precision } from "./types";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const SEASONS = [
  { id: "winter", label: "Winter", month: 1 },
  { id: "spring", label: "Spring", month: 4 },
  { id: "summer", label: "Summer", month: 7 },
  { id: "fall", label: "Fall", month: 10 },
] as const;

export function seasonOf(month: number) {
  if (month === 12 || month <= 2) return "Winter";
  if (month <= 5) return "Spring";
  if (month <= 8) return "Summer";
  return "Fall";
}

// "June 14, 2023" · "June 2023" · "Summer 2019" · "2021"
export function formatDate(iso: string, precision: Precision) {
  const [y, m, d] = iso.split("-").map(Number);
  switch (precision) {
    case "year":
      return String(y);
    case "season":
      return `${seasonOf(m)} ${y}`;
    case "month":
      return `${MONTHS[m - 1]} ${y}`;
    default:
      return `${MONTHS[m - 1]} ${d}, ${y}`;
  }
}

export function shortDate(iso: string, precision: Precision) {
  const [y, m, d] = iso.split("-").map(Number);
  if (precision === "year") return String(y);
  if (precision === "season") return `${seasonOf(m).slice(0, 3)} ${y}`;
  if (precision === "month") return `${MONTHS[m - 1].slice(0, 3)} ${y}`;
  return `${MONTHS[m - 1].slice(0, 3)} ${d} ${y}`;
}

export const todayIso = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

// A plan is anything whose date hasn't happened yet. Rough dates count as past once they begin.
export const isPlan = (iso: string) => iso > todayIso();

export const addedOn = (ts: string) => {
  const d = new Date(ts);
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
};

// ---------- spans: a stretch of time, or something that happens every year ----------

export interface When {
  date_start: string;
  date_precision: Precision;
  date_end?: string | null;
  ongoing?: number | boolean;
  repeats?: number | boolean;
}

const sameYear = (w: When) => !!w.date_end && w.date_end.slice(0, 4) === w.date_start.slice(0, 4);
const dropYear = (label: string) => label.replace(/,? \d{4}$/, "");

function repeatLabel(iso: string, precision: Precision) {
  const [, m, d] = iso.split("-").map(Number);
  if (precision === "season") return `Every ${seasonOf(m).toLowerCase()}`;
  if (precision === "month") return `Every ${MONTHS[m - 1]}`;
  return `Every ${MONTHS[m - 1]} ${d}`;
}

// "June 14, 2023" · "2015 – 2021" · "Summer 2018 – now" · "Every summer, 2010–2019" · "Every December since 2012"
export function formatWhen(w: When) {
  const startYear = w.date_start.slice(0, 4);
  if (w.repeats) {
    const base = repeatLabel(w.date_start, w.date_precision);
    const endYear = w.date_end?.slice(0, 4);
    if (!endYear || w.ongoing) return `${base} since ${startYear}`;
    return endYear === startYear ? `${base}, ${startYear}` : `${base}, ${startYear}–${endYear}`;
  }
  const start = formatDate(w.date_start, w.date_precision);
  if (w.ongoing) return `${start} – now`;
  if (w.date_end && w.date_end !== w.date_start) {
    const end = formatDate(w.date_end, w.date_precision);
    // Same year: "June – August 2019" instead of "June 2019 – August 2019".
    return sameYear(w) ? `${dropYear(start)} – ${end}` : `${start} – ${end}`;
  }
  return start;
}

// Two lines for the passport stamp: an optional small top line and the main date.
export function stampParts(w: When): { top?: string; main: string } {
  const sy = w.date_start.slice(0, 4);
  if (w.repeats) {
    const top = repeatLabel(w.date_start, w.date_precision);
    const ey = w.date_end?.slice(0, 4);
    return { top, main: !ey || w.ongoing ? `Since ${sy}` : ey === sy ? sy : `${sy}–${ey}` };
  }
  const start = shortDate(w.date_start, w.date_precision);
  if (w.ongoing) return { main: `${start} – now` };
  if (w.date_end && w.date_end !== w.date_start) {
    if (w.date_precision === "year") return { main: `${sy}–${w.date_end.slice(0, 4)}` };
    const end = shortDate(w.date_end, w.date_precision);
    return { main: sameYear(w) ? `${dropYear(start)} – ${end}` : `${start} – ${end}` };
  }
  return { main: start };
}
