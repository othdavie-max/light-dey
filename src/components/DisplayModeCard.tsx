"use client";
import { useEffect, useState } from "react";

interface Words { title: string; full: string; safe: string; note: string; chip: string }

/** Lets people switch "safe display" on or off (it turns off soft effects and animations that some phones mis-draw). */
export default function DisplayModeCard({ t, seg }: { t: Words; seg: (on: boolean) => React.CSSProperties }) {
  const [mode, setMode] = useState<"full" | "safe" | null>(null);
  const [chip, setChip] = useState("");

  useEffect(() => {
    // Read what the page decided at start-up (see the script in app/layout.tsx)
    const m = document.documentElement.dataset.gfx === "safe" ? "safe" : "full";
    let name = "";
    try {
      const gl = document.createElement("canvas").getContext("webgl");
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      name = ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    } catch { /* not available */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(m); setChip(name);
  }, []);

  const choose = (m: "full" | "safe") => {
    try { localStorage.setItem("ld_gfx", m); } catch { /* storage blocked: lasts for this visit */ }
    document.documentElement.dataset.gfx = m;
    setMode(m);
  };

  if (!mode) return null;
  return (
    <div className="panel rounded-2xl p-3">
      <p className="px-1 pb-2 text-sm text-muted">{t.title}</p>
      <div className="grid grid-cols-2 gap-2">
        <button className="press min-h-12 rounded-xl text-[15px] font-medium" style={seg(mode === "full")} onClick={() => choose("full")}>{t.full}</button>
        <button className="press min-h-12 rounded-xl text-[15px] font-medium" style={seg(mode === "safe")} onClick={() => choose("safe")}>{t.safe}</button>
      </div>
      <p className="px-1 pt-2 text-xs text-muted">{t.note}{chip ? ` ${t.chip}: ${chip}` : ""}</p>
    </div>
  );
}
