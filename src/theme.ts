// Light / dark / follow-the-phone. The choice lives on this device only.
import { useEffect, useState } from "react";

export type ThemeChoice = "auto" | "light" | "dark";

const KEY = "fmap.theme";
const query = () => window.matchMedia("(prefers-color-scheme: dark)");

export function savedTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  const dark = choice === "dark" || (choice === "auto" && query().matches);
  root.toggleAttribute("data-dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#171C1E" : "#F4EFE6");
  return dark;
}

// Returns the current choice, a setter, and whether the screen is actually dark right now.
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(savedTheme);
  const [dark, setDark] = useState(() => apply(savedTheme()));

  useEffect(() => {
    setDark(apply(choice));
    try {
      if (choice === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch {}
    if (choice !== "auto") return;
    const mq = query();
    const onChange = () => setDark(apply("auto"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  return { choice, setChoice, dark };
}
