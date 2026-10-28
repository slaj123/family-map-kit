import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { mediaUrl } from "../api";
import type { Media } from "../types";

interface Props {
  photos: Media[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  caption: (p: Media) => string;
  canRemove: (p: Media) => boolean;
  onRemove: (p: Media) => void;
}

const SWIPE_FRACTION = 0.18; // drag past 18% of the screen width to change photo
const FLICK_SPEED = 0.5; // or flick faster than this, in px per ms

// Full-screen photos. Swipe sideways to move between them, swipe down to close.
// On a computer: arrow keys and Escape.
export default function Lightbox({ photos, index, onIndex, onClose, caption, canRemove, onRemove }: Props) {
  const n = photos.length;
  const wrap = (i: number) => (i + n) % n;
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [animating, setAnimating] = useState(false);
  const start = useRef<{ x: number; y: number; t: number; axis: "x" | "y" | null; id: number } | null>(null);
  const moved = useRef(false);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (n > 1 && e.key === "ArrowRight") go(1);
      if (n > 1 && e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // Slide the strip one photo over, then swap the index and snap back with no animation.
  function go(dir: 1 | -1) {
    if (n < 2 || animating) return;
    setAnimating(true);
    setDx(-dir * window.innerWidth);
    setTimeout(() => {
      setAnimating(false);
      setDx(0);
      onIndex(wrap(index + dir));
    }, 220);
  }

  function down(e: React.PointerEvent) {
    if (animating || (e.target as HTMLElement).closest("button")) return;
    start.current = { x: e.clientX, y: e.clientY, t: performance.now(), axis: null, id: e.pointerId };
    moved.current = false;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  }

  function move(e: React.PointerEvent) {
    const s = start.current;
    if (!s || e.pointerId !== s.id) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.axis) {
      if (Math.hypot(mx, my) < 8) return;
      s.axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
    }
    moved.current = true;
    if (s.axis === "x") setDx(n > 1 ? mx : mx * 0.25);
    else setDy(Math.max(0, my));
  }

  function up(e: React.PointerEvent) {
    const s = start.current;
    start.current = null;
    if (!s || e.pointerId !== s.id) return;
    const ms = Math.max(1, performance.now() - s.t);
    if (s.axis === "x") {
      const speed = dx / ms;
      if (n > 1 && (dx < -window.innerWidth * SWIPE_FRACTION || speed < -FLICK_SPEED)) return go(1);
      if (n > 1 && (dx > window.innerWidth * SWIPE_FRACTION || speed > FLICK_SPEED)) return go(-1);
      setAnimating(true);
      setDx(0);
      setTimeout(() => setAnimating(false), 220);
    } else if (s.axis === "y") {
      if (dy > 120 || dy / ms > FLICK_SPEED) return onClose();
      setDy(0);
    } else if (!moved.current && (e.target as HTMLElement).classList.contains("lightbox-stage")) {
      onClose(); // a plain tap on the dark area around the photo
    }
  }

  const current = photos[index];
  const slides = n > 1 ? [wrap(index - 1), index, wrap(index + 1)] : [index];

  // Rendered on <body>: inside the sheet, its slide animation would trap a fixed overlay.
  return createPortal(
    <div className="lightbox" role="dialog" aria-label="Photos" style={{ "--fade": String(1 - Math.min(dy / 400, 0.6)) } as React.CSSProperties}>
      <div className="lightbox-top">
        <span>{n > 1 ? `${index + 1} of ${n}` : ""}</span>
        <button className="lightbox-btn" onClick={onClose}>Close</button>
      </div>
      <div className="lightbox-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div
          className={`lightbox-track${animating ? " is-animating" : ""}`}
          style={{
            transform: `translate3d(calc(${n > 1 ? -100 : 0}% + ${dx}px), ${dy}px, 0)`,
          }}
        >
          {slides.map((i, k) => (
            <div className="lightbox-slide" key={`${i}-${k}`}>
              <img src={mediaUrl(photos[i].id)} alt="" draggable={false} />
            </div>
          ))}
        </div>
      </div>
      <div className="lightbox-bar">
        <span>{caption(current)}</span>
        <span className="row">
          {canRemove(current) && <button className="lightbox-btn" onClick={() => onRemove(current)}>Remove</button>}
          {n > 1 && (
            <>
              <button className="lightbox-btn arrow" onClick={() => go(-1)} aria-label="Previous photo">‹</button>
              <button className="lightbox-btn arrow" onClick={() => go(1)} aria-label="Next photo">›</button>
            </>
          )}
        </span>
      </div>
    </div>,
    document.body
  );
}
