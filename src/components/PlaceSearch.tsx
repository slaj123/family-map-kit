import { useEffect, useRef, useState } from "react";

// Free place search from OpenStreetMap data (Photon by Komoot). No key needed.
const PHOTON = "https://photon.komoot.io";

export interface FoundPlace {
  name: string;
  detail: string;
  lat: number;
  lng: number;
}

function describe(p: any): FoundPlace {
  const props = p.properties ?? {};
  const name = props.name ?? [props.housenumber, props.street].filter(Boolean).join(" ") ?? props.city ?? "Unnamed place";
  const detail = [props.city !== name ? props.city : null, props.state, props.country].filter(Boolean).join(", ");
  const [lng, lat] = p.geometry.coordinates;
  return { name: name || props.city || props.country || "Unnamed place", detail, lat, lng };
}

export async function reverseName(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`${PHOTON}/reverse?lat=${lat}&lon=${lng}&limit=1`);
    const data = await res.json();
    const f = data.features?.[0];
    if (!f) return "";
    const p = f.properties ?? {};
    return p.name ?? p.street ?? p.city ?? p.county ?? p.state ?? "";
  } catch {
    return "";
  }
}

interface Props {
  near?: { lat: number; lng: number } | null;
  onPick: (p: FoundPlace) => void;
}

export default function PlaceSearch({ near, onPick }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoundPlace[]>([]);
  const [status, setStatus] = useState<"" | "loading" | "empty" | "error">("");
  const seq = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 3) {
      setResults([]);
      setStatus("");
      return;
    }
    const mine = ++seq.current;
    setStatus("loading");
    const t = window.setTimeout(async () => {
      try {
        const bias = near ? `&lat=${near.lat}&lon=${near.lng}` : "";
        const res = await fetch(`${PHOTON}/api/?q=${encodeURIComponent(query)}&limit=6${bias}`);
        const data = await res.json();
        if (mine !== seq.current) return;
        const found = (data.features ?? []).map(describe);
        setResults(found);
        setStatus(found.length ? "" : "empty");
      } catch {
        if (mine === seq.current) setStatus("error");
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [q]);

  return (
    <div className="place-search">
      <input
        type="search"
        placeholder="Yosemite, Lisbon, Grandma's house"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search for a place"
        autoFocus
      />
      {status === "loading" && <p className="muted small">Searching…</p>}
      {status === "empty" && <p className="muted small">No matches. Try a city, or tap the map instead.</p>}
      {status === "error" && <p className="error small">Search is unavailable. Tap the map instead.</p>}
      {results.length > 0 && (
        <ul className="results">
          {results.map((r, i) => (
            <li key={i}>
              <button type="button" onClick={() => onPick(r)}>
                <strong>{r.name}</strong>
                {r.detail && <span className="muted"> {r.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
