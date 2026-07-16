// components/useUnlockSound.ts
import { useCallback, useRef } from "react";

function synthesizeChime(ctx: AudioContext) {
  const now = ctx.currentTime;

  const notes = [
    { freq: 1318.5, start: 0,    dur: 0.35 },
    { freq: 1046.5, start: 0.15, dur: 0.55 },
  ];

  notes.forEach(({ freq, start, dur }) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + start);

    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(0.22, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);

    osc.start(now + start);
    osc.stop(now + start + dur);
  });
}

export function useUnlockSound(enabled: boolean): () => void {
  const ctxRef = useRef<AudioContext | null>(null);

  return useCallback(() => {
    if (!enabled) return;
    try {
      if (!ctxRef.current) {
        ctxRef.current = new AudioContext();
      }
      const ctx = ctxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume().then(() => synthesizeChime(ctx));
      } else {
        synthesizeChime(ctx);
      }
    } catch (err) {
      console.warn("Unlock sound failed:", err);
    }
  }, [enabled]);
}