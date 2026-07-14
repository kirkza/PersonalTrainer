"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Rest countdown pinned above the bottom nav. Wall-clock based, so it stays
 * accurate when the phone browser freezes the tab: `endsAt` is a timestamp,
 * and remaining time is recomputed on every tick and on tab return.
 * On finish: beep + vibrate when visible, best-effort Notification when not
 * (background delivery depends on the phone browser — not guaranteed).
 */
export default function RestTimer({
  endsAt,
  onDismiss,
  onExtend,
}: {
  endsAt: number;
  onDismiss: () => void;
  onExtend: (extraMs: number) => void;
}) {
  // real value arrives from the first effect tick; avoids Date.now() in render
  const [remainingMs, setRemainingMs] = useState(Number.MAX_SAFE_INTEGER);
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
  }, [endsAt]);

  useEffect(() => {
    const tick = () => {
      const left = endsAt - Date.now();
      setRemainingMs(left);
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true;
        try {
          navigator.vibrate?.([300, 100, 300]);
        } catch {}
        beep();
        if (
          document.hidden &&
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          try {
            new Notification("Rest over 💪", {
              body: "Time for your next set",
              tag: "pft-rest",
            });
          } catch {}
        }
      }
    };
    tick();
    const id = setInterval(tick, 500);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [endsAt]);

  // auto-hide a while after finishing
  useEffect(() => {
    if (remainingMs > -15000) return;
    onDismiss();
  }, [remainingMs, onDismiss]);

  const done = remainingMs <= 0;
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = String(totalSec % 60).padStart(2, "0");

  return (
    <div className="fixed inset-x-0 bottom-14 z-10">
      <div
        className={`mx-auto flex max-w-md items-center gap-3 border-t px-4 py-2.5 backdrop-blur ${
          done
            ? "border-accent/50 bg-accent/20"
            : "border-border-subtle bg-surface/95"
        }`}
      >
        <span className={`text-lg font-bold tabular-nums ${done ? "text-accent" : ""}`}>
          {done ? "Go! 💪" : `${mm}:${ss}`}
        </span>
        <span className="flex-1 text-xs text-muted">
          {done ? "rest over — next set" : "resting"}
        </span>
        {!done && (
          <button
            onClick={() => onExtend(30000)}
            className="rounded-lg border border-border-subtle bg-surface-2 px-3 py-1.5 text-xs"
          >
            +30s
          </button>
        )}
        <button onClick={onDismiss} className="px-2 py-1.5 text-xs text-muted">
          {done ? "✕" : "skip"}
        </button>
      </div>
    </div>
  );
}

/** Two short beeps via WebAudio; context is created lazily on first use. */
let audioCtx: AudioContext | null = null;

export function primeAudio() {
  // must be called from a user gesture (the ✓ tap) so the context is allowed
  try {
    type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
    const Ctor =
      window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!Ctor) return;
    audioCtx = audioCtx ?? new Ctor();
    if (audioCtx.state === "suspended") void audioCtx.resume();
  } catch {}
}

function beep() {
  if (!audioCtx || audioCtx.state !== "running") return;
  try {
    [0, 0.35].forEach((offset) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, audioCtx!.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audioCtx!.currentTime + offset + 0.25
      );
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(audioCtx!.currentTime + offset);
      osc.stop(audioCtx!.currentTime + offset + 0.3);
    });
  } catch {}
}

/** Ask for notification permission once, from a user gesture. */
export function maybeRequestNotifications() {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem("pft-notif-asked")) return;
    localStorage.setItem("pft-notif-asked", "1");
    void Notification.requestPermission();
  } catch {}
}
