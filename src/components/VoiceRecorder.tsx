import { useEffect, useRef, useState } from "react";
import { formatDuration, pickAudioType, type Recording } from "../media";

const MAX_SECONDS = 10 * 60;

interface Props {
  value: Recording | null;
  onChange: (r: Recording | null) => void;
}

export default function VoiceRecorder({ value, onChange }: Props) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const started = useRef(0);

  useEffect(() => () => stopAll(), []);

  function stopAll() {
    window.clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  async function start() {
    setError("");
    const type = pickAudioType();
    if (type === null || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't record audio. On a phone, open the app over https.");
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone blocked. Allow it in your browser settings, then try again.");
      return;
    }
    const rec = new MediaRecorder(stream.current, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const duration = (performance.now() - started.current) / 1000;
      const mime = rec.mimeType || type || "audio/mp4";
      const blob = new Blob(chunks, { type: mime });
      stopAll();
      setRecording(false);
      if (duration < 1) return setError("That was too short. Hold on a bit longer.");
      onChange({ blob, type: mime, duration, url: URL.createObjectURL(blob) });
    };
    recorder.current = rec;
    rec.start(1000);
    started.current = performance.now();
    setElapsed(0);
    setRecording(true);
    timer.current = window.setInterval(() => {
      const s = (performance.now() - started.current) / 1000;
      setElapsed(s);
      if (s >= MAX_SECONDS) rec.state === "recording" && rec.stop();
    }, 250);
  }

  const stop = () => recorder.current?.state === "recording" && recorder.current.stop();

  if (value && !recording) {
    return (
      <div className="voice-box">
        <audio controls src={value.url} preload="metadata" />
        <div className="voice-meta">
          <span>{formatDuration(value.duration)}</span>
          <button type="button" className="btn-link" onClick={() => onChange(null)}>Delete and re-record</button>
        </div>
      </div>
    );
  }

  return (
    <div className="voice-box">
      <button
        type="button"
        className={`mic${recording ? " is-rec" : ""}`}
        onClick={recording ? stop : start}
        aria-label={recording ? "Stop recording" : "Record a voice memo"}
      >
        {recording ? <span className="mic-stop" /> : <MicIcon />}
      </button>
      <div className="voice-meta">
        {recording ? (
          <span className="rec-time">
            <span className="rec-dot" /> {formatDuration(elapsed)} <span className="muted">/ 10:00</span>
          </span>
        ) : (
          <span className="muted">Tell it out loud. Up to 10 minutes.</span>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
