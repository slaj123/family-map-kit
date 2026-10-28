// SVG markup for map pins and clusters. Rules:
// color = category · solid = happened, hollow dashed = plan · inside the head = who.
import { CATEGORIES, categoryColor, type Category, type Person } from "./types";

const INK = "#1F2A2E";
const PAPER = "#F4EFE6";
const PIN_PATH = "M18 47C18 47 3 29 3 18A15 15 0 1 1 33 18C33 29 18 47 18 47Z";

export interface PinSpec {
  category: Category;
  plan: boolean;
  people: Person[]; // already in family order
  allFamily: boolean;
  count: number;
  selected?: boolean;
}

function face(p: Person, cx: number, cy: number, r: number, ring: string) {
  const petRing =
    p.kind === "pet"
      ? `<circle cx="${cx}" cy="${cy}" r="${r + 1.6}" fill="none" stroke="${INK}" stroke-width="0.9" stroke-dasharray="1.2 1.2"/>`
      : "";
  return `${petRing}<circle cx="${cx}" cy="${cy}" r="${r}" fill="${PAPER}" stroke="${ring}" stroke-width="1.2"/>
    <text x="${cx}" y="${cy + r * 0.38}" text-anchor="middle" font-size="${r * 1.15}" font-weight="600" fill="${INK}">${p.initial}</text>`;
}

function who(spec: PinSpec, color: string) {
  const humans = spec.people.filter((p) => p.kind === "person");
  const pets = spec.people.filter((p) => p.kind === "pet");
  let head = "";
  let extra = 0;

  if (spec.allFamily) {
    head = `<circle cx="18" cy="18" r="10" fill="${PAPER}"/>
      <text x="18" y="21.6" text-anchor="middle" font-size="9.5" font-weight="600" fill="${INK}">All</text>`;
  } else if (humans.length === 1 || (humans.length === 0 && pets.length > 0)) {
    const p = humans[0] ?? pets[0];
    head = `<circle cx="18" cy="18" r="10" fill="${PAPER}"/>
      <text x="18" y="22" text-anchor="middle" font-size="11.5" font-weight="600" fill="${INK}">${p.initial}</text>`;
    if (!humans.length) return head;
  } else {
    head = face(humans[0], 13.5, 18, 7, color) + face(humans[1], 22.5, 18, 7, color);
    extra = humans.length - 2;
  }

  let chips = "";
  if (extra > 0) {
    chips += `<rect x="20" y="25" width="14" height="10" rx="5" fill="${INK}"/>
      <text x="27" y="32.5" text-anchor="middle" font-size="7.5" font-weight="600" fill="${PAPER}">+${extra}</text>`;
  }
  if (pets.length && humans.length) chips += face(pets[0], 7, 30, 4.6, color);
  return head + chips;
}

export function pinSvg(spec: PinSpec) {
  const color = categoryColor(spec.category);
  const body = spec.plan
    ? `<path d="${PIN_PATH}" fill="${PAPER}" stroke="${color}" stroke-width="2.2" stroke-dasharray="3 2.5"/>`
    : `<path d="${PIN_PATH}" fill="${color}" stroke="${INK}" stroke-width="${spec.selected ? 2.2 : 1}"/>`;
  const badge =
    spec.count > 1
      ? `<circle cx="33" cy="6" r="6.5" fill="${INK}" stroke="${PAPER}" stroke-width="1"/>
         <text x="33" y="9" text-anchor="middle" font-size="8" font-weight="600" fill="${PAPER}">${spec.count > 99 ? "99" : spec.count}</text>`
      : "";
  const w = spec.selected ? 50 : 38;
  return `<svg width="${w}" height="${(w * 50) / 38}" viewBox="-1 -1 40 50" style="overflow:visible;display:block">
    ${body}${who(spec, spec.plan ? color : color)}${badge}</svg>`;
}

// Donut ring showing the category mix hidden inside a cluster.
export function clusterSvg(counts: Record<Category, number>) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const size = total >= 50 ? 58 : total >= 10 ? 50 : 44;
  const r = 18;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const arcs = CATEGORIES.filter((c) => counts[c.id] > 0)
    .map((c) => {
      const len = (counts[c.id] / total) * circ;
      const arc = `<circle cx="24" cy="24" r="${r}" fill="none" stroke="${c.color}" stroke-width="5.5"
        stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}"/>`;
      offset += len;
      return arc;
    })
    .join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" style="display:block">
    <circle cx="24" cy="24" r="22" fill="${PAPER}" stroke="${INK}" stroke-width="0.6"/>
    <g transform="rotate(-90 24 24)">${arcs}</g>
    <text x="24" y="29" text-anchor="middle" font-size="14" font-weight="600" fill="${INK}">${total}</text></svg>`;
}
