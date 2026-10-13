"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabase/browser";

/** The signed-in person's points, streak and nickname. Shows the copy kept on the phone first, then the fresh numbers. */
export function useMyStats() {
  const [s, setS] = useState<{ points: number; streak: number; nickname: string | null }>({ points: 0, streak: 0, nickname: null });
  useEffect(() => {
    let cancelled = false;
    try {
      const v = JSON.parse(localStorage.getItem("ld_stats") ?? "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (v && typeof v.points === "number") setS((x) => ({ ...x, points: v.points, streak: v.streak ?? 0 }));
    } catch { /* nothing saved */ }
    (async () => {
      const sb = supabase();
      const { data } = await sb.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return;
      const { data: p } = await sb.from("profiles").select("points,streak_current,nickname").eq("id", uid).maybeSingle();
      if (p && !cancelled) setS({ points: p.points, streak: p.streak_current, nickname: p.nickname });
    })();
    return () => { cancelled = true; };
  }, []);
  return s;
}
