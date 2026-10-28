import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { clusterSvg, pinSvg, type PinSpec } from "../pins";
import { CATEGORIES, type Category } from "../types";

// Free, no-key vector map (OpenFreeMap). Recolored below to the paper palette.
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const VIEW_KEY = "fmap.view";
const LONG_PRESS_MS = 550;

// MapLibre 6 runs its tile work in a module worker; point it at the file Vite serves.
maplibregl.setWorkerUrl(workerUrl);

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  spec: PinSpec;
  counts: Record<Category, number>;
}

export interface FlyTarget {
  lat: number;
  lng: number;
  zoom?: number;
  key: number;
}

interface Props {
  pins: MapPin[];
  selectedId: string | null;
  draftPoint: { lat: number; lng: number } | null;
  pickMode: boolean;
  dark: boolean;
  flyTo: FlyTarget | null;
  onSelect: (placeId: string) => void;
  onPick: (lat: number, lng: number) => void;
  onMapReady?: (map: maplibregl.Map) => void;
}

// Same map, two inks: paper by day, a dark leather cover by night.
const MAP_COLORS = {
  light: { bg: "#F4EFE6", water: "#D3DDD9", park: "#E6E6D4", building: "#EAE2D3", landuse: "#EFE9DE", waterLine: "#C4D0CC", road: "#FFFDF8", border: "#B9AE9C", label: "#5E655F" },
  dark: { bg: "#1B2124", water: "#22343A", park: "#1F2923", building: "#262D30", landuse: "#1E2427", waterLine: "#2B4148", road: "#2E373B", border: "#4A4F4C", label: "#9EA39C" },
};

function paperize(map: maplibregl.Map, dark: boolean) {
  const c = dark ? MAP_COLORS.dark : MAP_COLORS.light;
  const set = (id: string, prop: string, value: unknown) => {
    try {
      map.setPaintProperty(id, prop as any, value);
    } catch {}
  };
  for (const layer of map.getStyle().layers ?? []) {
    const id = layer.id;
    if (layer.type === "background") set(id, "background-color", c.bg);
    else if (layer.type === "fill" && /water/.test(id)) set(id, "fill-color", c.water);
    else if (layer.type === "fill" && /park|wood|grass|landcover|forest/.test(id)) set(id, "fill-color", c.park);
    else if (layer.type === "fill" && /building/.test(id)) set(id, "fill-color", c.building);
    else if (layer.type === "fill" && /landuse|residential/.test(id)) set(id, "fill-color", c.landuse);
    else if (layer.type === "fill-extrusion") set(id, "fill-extrusion-color", c.building);
    else if (layer.type === "line" && /water|river/.test(id)) set(id, "line-color", c.waterLine);
    else if (layer.type === "line" && /road|highway|street|bridge|tunnel|rail|path/.test(id)) set(id, "line-color", c.road);
    else if (layer.type === "line" && /boundary|admin/.test(id)) set(id, "line-color", c.border);
    else if (layer.type === "symbol") {
      set(id, "text-color", c.label);
      set(id, "text-halo-color", c.bg);
    }
  }
}

function toGeoJSON(pins: MapPin[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: pins.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { id: p.id, ...Object.fromEntries(CATEGORIES.map((c) => [`c_${c.id}`, p.counts[c.id]])) },
    })),
  };
}

function savedView() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null");
    if (v && typeof v.lng === "number") return v as { lng: number; lat: number; zoom: number };
  } catch {}
  return null;
}

export default function MapView(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef(new Map<string, { marker: maplibregl.Marker; html: string }>());
  const draftMarker = useRef<maplibregl.Marker | null>(null);
  const latest = useRef(props);
  latest.current = props;

  // Build the map once.
  useEffect(() => {
    const view = savedView();
    const map = new maplibregl.Map({
      container: container.current!,
      style: STYLE_URL,
      center: view ? [view.lng, view.lat] : [-119.5, 36.5],
      zoom: view ? view.zoom : 4.3,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
    mapRef.current = map;
    if (import.meta.env.DEV) (window as any).__familyMap = map;

    map.on("load", () => {
      paperize(map, latest.current.dark);
      map.addSource("places", {
        type: "geojson",
        data: toGeoJSON(latest.current.pins),
        cluster: true,
        clusterRadius: 46,
        clusterMaxZoom: 15,
        clusterProperties: Object.fromEntries(CATEGORIES.map((c) => [c.id, ["+", ["get", `c_${c.id}`]]])),
      });
      // Invisible layer: makes the source load tiles. The visible pins are HTML markers.
      map.addLayer({ id: "places-hit", type: "circle", source: "places", paint: { "circle-opacity": 0, "circle-radius": 1 } });
      if (!view && latest.current.pins.length) fitAll(map, latest.current.pins);
      latest.current.onMapReady?.(map);
    });

    map.on("render", () => {
      if (map.getSource("places") && map.isSourceLoaded("places")) syncMarkers();
    });

    map.on("moveend", () => {
      const c = map.getCenter();
      try {
        localStorage.setItem(VIEW_KEY, JSON.stringify({ lng: c.lng, lat: c.lat, zoom: map.getZoom() }));
      } catch {}
    });

    // Right-click on a computer, long-press on a phone, or a plain tap in pick mode.
    map.on("contextmenu", (e: maplibregl.MapMouseEvent) => latest.current.onPick(e.lngLat.lat, e.lngLat.lng));
    map.on("click", (e: maplibregl.MapMouseEvent) => {
      if (latest.current.pickMode) latest.current.onPick(e.lngLat.lat, e.lngLat.lng);
    });
    let pressTimer: number | undefined;
    const cancelPress = () => window.clearTimeout(pressTimer);
    map.on("touchstart", (e: maplibregl.MapTouchEvent) => {
      cancelPress();
      if (e.originalEvent.touches.length !== 1) return;
      const { lat, lng } = e.lngLat;
      pressTimer = window.setTimeout(() => {
        navigator.vibrate?.(15);
        latest.current.onPick(lat, lng);
      }, LONG_PRESS_MS);
    });
    map.on("touchend", cancelPress);
    map.on("touchcancel", cancelPress);
    map.on("movestart", cancelPress);

    return () => {
      cancelPress();
      map.remove();
      mapRef.current = null;
      markers.current.clear();
    };
  }, []);

  function syncMarkers() {
    const map = mapRef.current;
    if (!map) return;
    const { pins, selectedId } = latest.current;
    const byId = new Map(pins.map((p) => [p.id, p]));
    const seen = new Set<string>();

    for (const f of map.querySourceFeatures("places")) {
      const props = f.properties as any;
      const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      let key: string;
      let html: string;
      let onClick: () => void;

      if (props.cluster) {
        key = `cluster-${props.cluster_id}`;
        const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, props[c.id] ?? 0])) as Record<Category, number>;
        html = clusterSvg(counts);
        onClick = async () => {
          const source = map.getSource("places") as maplibregl.GeoJSONSource;
          const zoom = await source.getClusterExpansionZoom(props.cluster_id);
          map.easeTo({ center: coords, zoom: Math.min(zoom + 0.5, 18) });
        };
      } else {
        const pin = byId.get(props.id);
        if (!pin) continue;
        key = `pin-${pin.id}`;
        html = pinSvg({ ...pin.spec, selected: pin.id === selectedId });
        onClick = () => latest.current.onSelect(pin.id);
      }
      if (seen.has(key)) continue;
      seen.add(key);

      const existing = markers.current.get(key);
      if (existing && existing.html === html) continue;
      existing?.marker.remove();

      const el = document.createElement("button");
      el.className = props.cluster ? "map-cluster" : "map-pin";
      el.setAttribute("aria-label", props.cluster ? "Group of memories. Zoom in." : "Open place");
      el.innerHTML = html;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onClick();
      });
      const marker = new maplibregl.Marker({ element: el, anchor: props.cluster ? "center" : "bottom" })
        .setLngLat(coords)
        .addTo(map);
      if (!props.cluster && props.id === selectedId) el.style.zIndex = "5";
      markers.current.set(key, { marker, html });
    }

    for (const [key, { marker }] of markers.current) {
      if (!seen.has(key)) {
        marker.remove();
        markers.current.delete(key);
      }
    }
  }

  // Push new pin data into the map when filters or data change.
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("places") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(toGeoJSON(props.pins));
    for (const { marker } of markers.current.values()) marker.remove();
    markers.current.clear();
    map!.triggerRepaint();
  }, [props.pins]);

  useEffect(() => {
    mapRef.current?.triggerRepaint();
  }, [props.selectedId]);

  // Zoom to a place at street level. On phones the bottom sheet covers the lower map,
  // so the place lands in the top third instead of dead center.
  useEffect(() => {
    const t = props.flyTo;
    const map = mapRef.current;
    if (!t || !map) return;
    map.resize(); // the side panel may have just changed the map's width
    const phone = window.innerWidth < 900 && latest.current.selectedId;
    map.flyTo({
      center: [t.lng, t.lat],
      zoom: t.zoom ?? Math.max(map.getZoom(), 16),
      offset: phone ? [0, -map.getContainer().clientHeight * 0.3] : [0, 0],
      speed: 1.4,
      essential: true,
    });
  }, [props.flyTo?.key]);

  // The dashed "you're adding here" marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!props.draftPoint) {
      draftMarker.current?.remove();
      draftMarker.current = null;
      return;
    }
    if (!draftMarker.current) {
      const el = document.createElement("div");
      el.className = "draft-marker";
      el.innerHTML = `<svg width="38" height="50" viewBox="-1 -1 40 50"><path d="M18 47C18 47 3 29 3 18A15 15 0 1 1 33 18C33 29 18 47 18 47Z" fill="#F4EFE6" stroke="#1F2A2E" stroke-width="2" stroke-dasharray="3 2.5"/><circle cx="18" cy="18" r="4" fill="#1F2A2E"/></svg>`;
      draftMarker.current = new maplibregl.Marker({ element: el, anchor: "bottom" });
    }
    draftMarker.current.setLngLat([props.draftPoint.lng, props.draftPoint.lat]).addTo(map);
  }, [props.draftPoint?.lat, props.draftPoint?.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.isStyleLoaded()) paperize(map, props.dark);
  }, [props.dark]);

  useEffect(() => {
    mapRef.current?.getCanvas().classList.toggle("picking", props.pickMode);
  }, [props.pickMode]);

  return <div ref={container} className="map" />;
}

export function fitAll(map: maplibregl.Map, pins: { lat: number; lng: number }[]) {
  if (!pins.length) return;
  const bounds = new maplibregl.LngLatBounds();
  for (const p of pins) bounds.extend([p.lng, p.lat]);
  map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 0 });
}
