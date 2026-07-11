"use client";

import { useState } from "react";

/** Shows the static thumbnail; tap to play the animated GIF. Saves data at the gym. */
export default function ExerciseGif({
  imageUrl,
  gifUrl,
  name,
  size = 88,
}: {
  imageUrl: string;
  gifUrl: string;
  name: string;
  size?: number;
}) {
  const [playing, setPlaying] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setPlaying((p) => !p)}
      className="relative shrink-0 overflow-hidden rounded-lg bg-white"
      style={{ width: size, height: size }}
      aria-label={`${playing ? "Pause" : "Play"} demonstration of ${name}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={playing ? gifUrl : imageUrl}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        className="h-full w-full object-contain"
      />
      {!playing && (
        <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">
          ▶
        </span>
      )}
    </button>
  );
}
