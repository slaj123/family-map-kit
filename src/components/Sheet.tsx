import { useEffect, useRef, useState, type ReactNode } from "react";

// The place/memory panel. On phones it's a bottom sheet you can drag: up to full height,
// down to half, further down to close. On computers it's a fixed right column.
const HALF = 0.58;
const FULL = 0.92;
const CLOSE_BELOW = 0.3;
const GRAB = ".sheet-grab, .panel-head, .detail-top";

const isPhone = () => window.innerWidth < 900;

interface Props {
  label: string;
  resetKey: string; // a new place starts at half height again
  onClose: () => void;
  children: ReactNode;
}

export default function Sheet({ label, resetKey, onClose, children }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [snap, setSnap] = useState<number>(HALF);
  const [closing, setClosing] = useState(false);
  const drag = useRef<{ y: number; h: number; t: number; moved: boolean; id: number } | null>(null);

  useEffect(() => setSnap(HALF), [resetKey]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const vh = () => window.innerHeight;
    const setHeight = (px: number | null) => {
      el.style.height = px === null ? "" : `${px}px`;
    };

    const down = (e: PointerEvent) => {
      if (!isPhone() || !(e.target as HTMLElement).closest(GRAB)) return;
      drag.current = { y: e.clientY, h: el.getBoundingClientRect().height, t: performance.now(), moved: false, id: e.pointerId };
    };
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.abs(dy) < 6) return;
      if (!d.moved) {
        d.moved = true;
        try {
          el.setPointerCapture(e.pointerId);
        } catch {}
        el.classList.add("is-dragging");
      }
      setHeight(Math.max(80, Math.min(vh() * FULL, d.h - dy)));
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      if (!d || e.pointerId !== d.id) return;
      el.classList.remove("is-dragging");
      if (!d.moved) return;
      // A drag swallows the click that would otherwise fire on a button under the finger.
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      el.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => el.removeEventListener("click", swallow, { capture: true }), 50);

      const h = el.getBoundingClientRect().height / vh();
      const speed = (e.clientY - d.y) / Math.max(1, performance.now() - d.t); // px per ms, + is down
      setHeight(null);
      if (h < CLOSE_BELOW || (speed > 0.9 && h < HALF + 0.05)) {
        setClosing(true);
        setTimeout(onClose, 180);
      } else if (speed < -0.6) setSnap(FULL);
      else if (speed > 0.6) setSnap(HALF);
      else setSnap(Math.abs(h - FULL) < Math.abs(h - HALF) ? FULL : HALF);
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [onClose]);

  return (
    <aside
      ref={ref}
      className={`panel${closing ? " is-closing" : ""}${snap === FULL ? " is-full" : ""}`}
      style={{ "--sheet-h": `${snap * 100}dvh` } as React.CSSProperties}
      aria-label={label}
    >
      <div className="sheet-grab" aria-hidden="true">
        <span />
      </div>
      {children}
    </aside>
  );
}
