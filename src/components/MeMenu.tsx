import { useEffect, useRef, useState } from "react";
import type { ThemeChoice } from "../theme";
import type { Person } from "../types";
import Face from "./Face";

interface Props {
  me: Person;
  theme: ThemeChoice;
  onTheme: (t: ThemeChoice) => void;
  onEditFamily: () => void;
  onSwitchPerson: () => void;
  onSignOut: () => void;
}

// Tap your face: pick light/dark, edit the family, hand the device to someone else, or sign out.
export default function MeMenu({ me, theme, onTheme, onEditFamily, onSwitchPerson, onSignOut }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="me-menu" ref={ref}>
      <button className="me-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`${me.name}. Settings.`}>
        <Face person={me} size="sm" />
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          <p className="eyebrow">You're {me.name} on this device</p>
          <div className="field">
            <span>Look</span>
            <div className="segmented wide" role="group" aria-label="Light or dark">
              {(["auto", "light", "dark"] as const).map((t) => (
                <button key={t} type="button" className={theme === t ? "is-on" : ""} aria-pressed={theme === t} onClick={() => onTheme(t)}>
                  {t === "auto" ? "Match phone" : t === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>
          </div>
          <button className="btn" onClick={() => { setOpen(false); onEditFamily(); }}>Edit family</button>
          <button className="btn" onClick={() => { setOpen(false); onSwitchPerson(); }}>Switch person</button>
          <button className="btn" onClick={() => { setOpen(false); onSignOut(); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}
