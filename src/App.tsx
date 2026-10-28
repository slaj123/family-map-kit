import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { api, getMe, setMe } from "./api";
import { isPlan } from "./dates";
import { CATEGORIES, type Category, type MemoryDetail as Detail, type MemorySummary, type Place, type World } from "./types";
import MapView, { type FlyTarget, type MapPin } from "./components/MapView";
import FilterBar, { EMPTY_FILTERS, type Filters } from "./components/FilterBar";
import PlacePanel from "./components/PlacePanel";
import MemoryDetail from "./components/MemoryDetail";
import AddMemory, { type AddMode } from "./components/AddMemory";
import Login from "./components/Login";
import WhoAreYou from "./components/WhoAreYou";
import InstallHint from "./components/InstallHint";
import Face from "./components/Face";
import ListView from "./components/ListView";
import MeMenu from "./components/MeMenu";
import Sheet from "./components/Sheet";
import { useTheme } from "./theme";

type Auth = "checking" | "login" | "ok";
type View = "map" | "list";
const VIEW_KEY = "fmap.view.mode";

function savedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "map";
  } catch {
    return "map";
  }
}

function matches(m: MemorySummary, place: Place, f: Filters) {
  if (f.categories.length && !f.categories.includes(m.category)) return false;
  if (f.time === "past" && isPlan(m.date_start)) return false;
  if (f.time === "plans" && !isPlan(m.date_start)) return false;
  if (f.people.length) {
    if (f.peopleMode === "added" ? !f.people.includes(m.created_by) : !f.people.every((p) => m.people.includes(p))) return false;
  }
  const q = f.query.trim().toLowerCase();
  if (q && !`${m.title} ${place.name}`.toLowerCase().includes(q)) return false;
  return true;
}

// The pin's look comes from the memories currently visible at that place.
function buildPins(world: World, filters: Filters): MapPin[] {
  const order = new Map(world.people.map((p, i) => [p.id, i]));
  const humans = world.people.filter((p) => p.kind === "person");
  const pins: MapPin[] = [];
  for (const place of world.places) {
    const visible = place.memories.filter((m) => matches(m, place, filters));
    if (!visible.length) continue;
    const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0])) as Record<Category, number>;
    for (const m of visible) counts[m.category]++;
    const latest = [...visible].sort((a, b) => b.date_start.localeCompare(a.date_start))[0];
    const top = (Object.keys(counts) as Category[]).reduce((a, b) =>
      counts[b] > counts[a] || (counts[b] === counts[a] && b === latest.category) ? b : a
    );
    const who = new Set(visible.flatMap((m) => m.people));
    const people = world.people.filter((p) => who.has(p.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    pins.push({
      id: place.id,
      lat: place.lat,
      lng: place.lng,
      counts,
      spec: {
        category: top,
        plan: visible.every((m) => isPlan(m.date_start)),
        people,
        allFamily: humans.every((h) => who.has(h.id)),
        count: visible.length,
      },
    });
  }
  return pins;
}

export default function App() {
  const [auth, setAuth] = useState<Auth>("checking");
  const [me, setMeState] = useState<string | null>(getMe());
  const [world, setWorld] = useState<World | null>(null);
  const [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [memoryId, setMemoryId] = useState<string | null>(null);
  const [adding, setAdding] = useState<AddMode | null>(null);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<{ lat: number; lng: number; key: number } | null>(null);
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);
  const [rev, setRev] = useState(0);
  const [draftPoint, setDraftPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [view, setViewState] = useState<View>(savedView);
  const theme = useTheme();

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };
  const mapRef = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    api.session().then((s) => setAuth(s.authed ? "ok" : "login")).catch(() => setAuth("login"));
  }, []);

  const refresh = useCallback(async () => {
    try {
      setWorld(await api.world());
      setLoadError("");
    } catch (e: any) {
      if (e.status === 401) setAuth("login");
      else setLoadError(e.message);
    }
  }, []);

  useEffect(() => {
    if (auth === "ok") refresh();
  }, [auth, refresh]);

  const pins = useMemo(() => (world ? buildPins(world, filters) : []), [world, filters]);
  const shownCount = pins.reduce((n, p) => n + p.spec.count, 0);
  const totalCount = world?.places.reduce((n, p) => n + p.memories.length, 0) ?? 0;
  const place = world?.places.find((p) => p.id === placeId) ?? null;
  const listItems = useMemo(
    () =>
      world
        ? world.places.flatMap((p) => p.memories.filter((m) => matches(m, p, filters)).map((m) => ({ memory: m, place: p })))
        : [],
    [world, filters]
  );

  const closePanel = () => {
    setPlaceId(null);
    setMemoryId(null);
  };

  // Tapping a pin or a memory zooms the map to that spot.
  function zoomToPlace(id: string) {
    const p = world?.places.find((x) => x.id === id);
    if (p) setFlyTo({ lat: p.lat, lng: p.lng, key: Date.now() });
  }

  function startAdd(mode: AddMode) {
    setAdding(mode);
    setPicked(null);
    if (mode.kind === "new" && mode.point) setDraftPoint(mode.point);
  }

  function onMapPick(lat: number, lng: number) {
    if (picking) {
      setPicking(false);
      setDraftPoint({ lat, lng });
      setPicked({ lat, lng, key: Date.now() });
    } else if (!adding) {
      setDraftPoint({ lat, lng });
      startAdd({ kind: "new", point: { lat, lng } });
    }
  }

  function onSaved(m: Detail) {
    setAdding(null);
    setDraftPoint(null);
    setRev((r) => r + 1);
    refresh().then(() => {
      setPlaceId(m.place.id);
      setMemoryId(m.id);
      setFlyTo({ lat: m.place.lat, lng: m.place.lng, key: Date.now() });
    });
  }

  if (auth === "checking") return <div className="gate"><p className="muted">Loading…</p></div>;
  if (auth === "login") return <Login onDone={() => setAuth("ok")} />;
  if (!world) {
    return (
      <div className="gate">
        {loadError ? (
          <div className="gate-card">
            <p className="error">{loadError}</p>
            <button className="btn" onClick={refresh}>Try again</button>
          </div>
        ) : (
          <p className="muted">Loading the map…</p>
        )}
      </div>
    );
  }
  const meValid = me && world.people.some((p) => p.id === me && p.kind === "person");
  if (!meValid) {
    return <WhoAreYou people={world.people} onPick={(id) => { setMe(id); setMeState(id); }} />;
  }
  const mePerson = world.people.find((p) => p.id === me)!;
  const panelOpen = !!place && !adding;

  return (
    <div className={`app${panelOpen ? " has-panel" : ""}`}>
      <header className="topbar">
        <h1 className="wordmark">Family Map</h1>
        <div className="segmented view-toggle" role="group" aria-label="View">
          <button type="button" className={view === "map" ? "is-on" : ""} aria-pressed={view === "map"} onClick={() => setView("map")}>Map</button>
          <button type="button" className={view === "list" ? "is-on" : ""} aria-pressed={view === "list"} onClick={() => setView("list")}>List</button>
        </div>
        <MeMenu
          me={mePerson}
          theme={theme.choice}
          onTheme={theme.setChoice}
          onSwitchPerson={() => {
            setMe(null);
            setMeState(null);
          }}
          onSignOut={async () => {
            await api.logout().catch(() => {});
            setMe(null);
            setMeState(null);
            setWorld(null);
            setAuth("login");
          }}
        />
      </header>

      <FilterBar people={world.people} filters={filters} onChange={setFilters} shown={shownCount} total={totalCount} />
      <InstallHint />

      <main className="stage">
        <MapView
          pins={pins}
          selectedId={placeId}
          draftPoint={adding || picking ? draftPoint : null}
          pickMode={picking}
          dark={theme.dark}
          flyTo={flyTo}
          onSelect={(id) => {
            if (adding) return;
            setPlaceId(id);
            setMemoryId(null);
            zoomToPlace(id);
          }}
          onPick={onMapPick}
          onMapReady={(m) => (mapRef.current = m)}
        />
        {view === "list" && !picking && (
          <ListView
            items={listItems}
            people={world.people}
            selectedId={memoryId}
            emptyText={totalCount === 0 ? "No memories yet. Tap + to add the first one." : "Nothing matches those filters."}
            onOpen={(id, pid) => {
              setPlaceId(pid);
              setMemoryId(id);
            }}
          />
        )}
        {view === "map" && pins.length === 0 && (
          <div className="empty-note">
            {totalCount === 0 ? "No memories yet. Tap + to add the first one." : "Nothing matches those filters."}
          </div>
        )}
        {picking && (
          <div className="pick-banner">
            <span>Tap where it happened</span>
            <button className="btn-link light" onClick={() => setPicking(false)}>Cancel</button>
          </div>
        )}
        {!adding && !picking && (
          <button className="fab" onClick={() => startAdd({ kind: "new" })} aria-label="Add a memory">
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" /></svg>
          </button>
        )}
      </main>

      {panelOpen && (
        <Sheet label={place.name} resetKey={place.id} onClose={closePanel}>
          {memoryId ? (
            <MemoryDetail
              key={`${memoryId}-${rev}`}
              memoryId={memoryId}
              people={world.people}
              me={me!}
              onBack={() => (view === "list" ? closePanel() : setMemoryId(null))}
              backLabel={view === "list" ? "All memories" : undefined}
              onShowOnMap={view === "map" ? undefined : () => {
                setView("map");
                zoomToPlace(place.id);
              }}
              onEdit={(m) => startAdd({ kind: "edit", memory: m })}
              onChanged={refresh}
              onDeleted={() => {
                setMemoryId(null);
                refresh();
              }}
            />
          ) : (
            <PlacePanel
              place={place}
              people={world.people}
              onOpen={(id) => {
                setMemoryId(id);
                zoomToPlace(place.id);
              }}
              onAddHere={() => startAdd({ kind: "new", placeId: place.id })}
              onClose={closePanel}
            />
          )}
        </Sheet>
      )}

      {adding && (
        <div style={{ display: picking ? "none" : undefined }}>
          <AddMemory
            key={adding.kind === "edit" ? adding.memory.id : "new"}
            mode={adding}
            me={me!}
            people={world.people}
            places={world.places}
            pickedPoint={picked}
            mapCenter={() => {
              const c = mapRef.current?.getCenter();
              return c ? { lat: c.lat, lng: c.lng } : null;
            }}
            onRequestPick={() => setPicking(true)}
            onClose={() => {
              setAdding(null);
              setDraftPoint(null);
            }}
            onSaved={onSaved}
          />
        </div>
      )}
    </div>
  );
}
