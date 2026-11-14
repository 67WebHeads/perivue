import React, { useEffect, useRef, useState } from "react";
import { drawGrid, drawDot } from "../canvas/tangentGrid";
import { stimulusCss } from "../config/projection";

// Live preview of the projected tangent screen and stimulus, drawn with the
// same code as the test canvas. Used on the Settings page and in the test
// screen's settings modal.

// Match DEFAULT_PROTOCOL_SETTINGS in TestScreen.jsx
const SIZE_DEG = 0.5;
const SPEED_DEG_PER_SEC = 2;
const STATIC_POS = { xDeg: 14.14, yDeg: 14.14 }; // 20° out, upper right
const KINETIC_ANGLE = 135; // moves in from the upper left
const START_RADIUS = 35;

export default function StimulusPreview({ opacity, color }) {
  const [mode, setMode] = useState("static");
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  // Redraw on every change; kinetic mode animates a looping inward sweep
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let frame = null;
    let radius = START_RADIUS;
    let last = null;
    const css = stimulusCss(color);
    const rad = (KINETIC_ANGLE * Math.PI) / 180;

    function size() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(wrap.clientWidth * dpr);
      canvas.height = Math.round(wrap.clientHeight * dpr);
    }

    function draw() {
      const meta = drawGrid(canvas, opacity / 100);
      const x = mode === "static" ? STATIC_POS.xDeg : radius * Math.cos(rad);
      const y = mode === "static" ? STATIC_POS.yDeg : radius * Math.sin(rad);
      drawDot(canvas, meta, x, y, css, SIZE_DEG);
    }

    function tick(t) {
      if (last != null) radius -= (SPEED_DEG_PER_SEC * (t - last)) / 1000;
      last = t;
      if (radius <= 0) radius = START_RADIUS;
      draw();
      frame = requestAnimationFrame(tick);
    }

    size();
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (mode === "kinetic" && !reduceMotion) frame = requestAnimationFrame(tick);
    else draw();

    const ro = new ResizeObserver(() => {
      size();
      if (!frame) draw();
    });
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [opacity, color, mode]);

  const modeBtn = (value, label) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={`px-3 py-1 rounded-lg text-xs transition-all ${
        mode === value ? "bg-white/15 text-white" : "text-white/50 hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={wrapRef}
        className="relative w-full aspect-video rounded-2xl overflow-hidden border border-white/10 bg-black"
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Preview of the projected tangent screen and stimulus"
          className="absolute inset-0 w-full h-full"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-xl bg-white/5 border border-white/10 p-1">
          {modeBtn("static", "Static dot")}
          {modeBtn("kinetic", "Kinetic sweep")}
        </div>
        <p className="text-xs text-white/40">
          {mode === "static"
            ? "A dot at 20°. In the test it flashes for about 200 ms."
            : `Moves inward at ${SPEED_DEG_PER_SEC}°/s, the test speed.`}
        </p>
      </div>
    </div>
  );
}
