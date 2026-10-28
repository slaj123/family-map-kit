import { useState } from "react";
import { api } from "../api";

export default function Login({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return setError("Enter the family passcode.");
    setBusy(true);
    setError("");
    try {
      await api.login(code);
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={submit}>
        <p className="eyebrow">Private family map</p>
        <h1 className="display">Family Map</h1>
        <label className="field">
          <span>Family passcode</span>
          <input
            type="password"
            autoComplete="current-password"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setError("");
            }}
            autoFocus
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-ink" disabled={busy}>{busy ? "Checking…" : "Come in"}</button>
      </form>
    </div>
  );
}
