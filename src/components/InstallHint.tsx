import { useState } from "react";

const KEY = "fmap.installHintDismissed";

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;

function dismissed() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

// iPhones never offer an "Install" button for web apps, so we explain the two taps.
export default function InstallHint() {
  const [show, setShow] = useState(() => isIos() && !isStandalone() && !dismissed());
  if (!show) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    setShow(false);
  };
  return (
    <div className="install-hint" role="note">
      <div>
        <strong>Put it on your home screen.</strong> Tap <ShareIcon /> Share, then <em>Add to Home Screen</em>.
      </div>
      <button className="icon-btn" onClick={close} aria-label="Dismiss">×</button>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg width="14" height="16" viewBox="0 0 14 18" style={{ verticalAlign: "-2px" }} aria-hidden="true">
      <path d="M7 1v11M3.5 4.5 7 1l3.5 3.5M2 8H1v9h12V8h-1" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
