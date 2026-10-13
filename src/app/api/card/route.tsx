// GET /api/card?spot=<id>  or  ?area=<id>   [&lang=en|pcm] [&square=1]
// A picture of the live status, made to be posted on WhatsApp / X and used as the link preview image.
import { ImageResponse } from "next/og";
import { adminClient } from "@/lib/supabase/admin";
import { computeStatus } from "@/lib/status/compute";
import { formatAgo, formatDuration, formatLagosTime } from "@/lib/format";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const WORDS = {
  en: { on: "There is light", off: "No light", weak: "Light, but weak", mixed: "Mixed reports", unknown: "No reports yet", tag: "Is there light? Tell your neighbours." },
  pcm: { on: "Light dey", off: "No light", weak: "Light dey, but e weak", mixed: "Reports no agree", unknown: "No report yet", tag: "Light dey? Tell your neighbours." },
} as const;
const COLOUR = { on: "#ffc233", weak: "#ff9a4d", off: "#5b7bd5", mixed: "#8a93a8", unknown: "#8a93a8" } as const;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const lang = q.get("lang") === "en" ? "en" : "pcm";
  const square = q.get("square") === "1";
  const w = square ? 1080 : 1200, h = square ? 1080 : 630;
  const words = WORDS[lang];

  let name = "Light Dey?", place = "", status: keyof typeof COLOUR = "unknown", detail = "";
  try {
    const db = adminClient();
    let spotId = q.get("spot");
    const areaId = Number(q.get("area"));
    if (!spotId && Number.isInteger(areaId) && areaId > 0) {
      const { data } = await db.from("spots").select("id").eq("area_id", areaId).eq("is_default", true).neq("status_flag", "rejected").maybeSingle();
      spotId = data?.id ?? null;
    }
    if (spotId && UUID.test(spotId)) {
      const { data: spot } = await db.from("spots").select("name,disco_id,band,status_flag,areas(name,city)").eq("id", spotId).maybeSingle();
      if (spot && spot.status_flag !== "rejected") {
        const area = spot.areas as unknown as { name: string; city: string | null } | null;
        name = spot.name.replace(/ \(whole area\)$/, "");
        place = [area?.city, spot.band ? `Band ${spot.band}` : null].filter(Boolean).join(" · ");
        const { data: st } = await db.from("spot_status").select("status,since,last_report_at").eq("spot_id", spotId).maybeSingle();
        const now = new Date();
        const current = { status: (st?.status ?? "unknown") as "on" | "off" | "weak" | "mixed" | "unknown", since: st?.since ? new Date(st.since) : null, lastReportAt: st?.last_report_at ? new Date(st.last_report_at) : null };
        const shown = computeStatus([], current, now);
        status = shown.status;
        if (current.since && (status === "on" || status === "weak")) detail = `${formatDuration(now.getTime() - current.since.getTime())}`;
        else if (current.since && status === "off") detail = `${formatLagosTime(current.since)}`;
        if (shown.stale && current.lastReportAt && status !== "unknown") detail = lang === "en" ? `Last confirmed ${formatAgo(now.getTime() - current.lastReportAt.getTime())} ago` : `Last confirm: ${formatAgo(now.getTime() - current.lastReportAt.getTime())} ago`;
      }
    }
  } catch { /* the card still renders with generic words */ }

  const colour = COLOUR[status];
  const lit = status === "on" || status === "weak";
  const bulb = square ? 360 : 280;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: square ? "column" : "row", alignItems: "center", justifyContent: "center", gap: square ? 40 : 70, padding: 60, background: `radial-gradient(circle at ${square ? "50% 30%" : "28% 50%"}, ${lit ? "#4a3608" : "#17203a"} 0%, #0a1020 55%, #060a14 100%)`, color: "#f2f4fa", fontFamily: "sans-serif" }}>
        <svg width={bulb} height={Math.round(bulb * 1.35)} viewBox="0 0 200 270" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="g" cx="50%" cy="38%" r="70%">
              <stop offset="0" stopColor={lit ? "#ffffff" : "#3a4668"} />
              <stop offset="0.5" stopColor={lit ? (status === "weak" ? "#ffd9b0" : "#fff3c9") : "#232c46"} />
              <stop offset="1" stopColor={lit ? colour : "#141b30"} />
            </radialGradient>
            <linearGradient id="m" x1="0" x2="1"><stop offset="0" stopColor="#3b3f48" /><stop offset="0.3" stopColor="#e4e7ee" /><stop offset="0.7" stopColor="#7d838f" /><stop offset="1" stopColor="#30333a" /></linearGradient>
          </defs>
          <path d="M100 6C151 6 188 44 188 94C188 128 171 150 155 170C145 183 138 197 138 222L62 222C62 197 55 183 45 170C29 150 12 128 12 94C12 44 49 6 100 6Z" fill="url(#g)" />
          <path d="M44 62C50 40 68 24 90 20C72 34 58 52 54 80Z" fill="#ffffff" fillOpacity="0.6" />
          <rect x="61" y="220" width="78" height="14" rx="4" fill="url(#m)" />
          <rect x="65" y="232" width="70" height="14" rx="6" fill="url(#m)" />
          <rect x="69" y="244" width="62" height="14" rx="6" fill="url(#m)" />
          <path d="M84 256H116Q116 270 100 270T84 256Z" fill="url(#m)" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", alignItems: square ? "center" : "flex-start", textAlign: square ? "center" : "left", maxWidth: square ? 900 : 620 }}>
          <div style={{ fontSize: 34, color: "#9aa3b8", display: "flex" }}>{name}{place ? `  ·  ${place}` : ""}</div>
          <div style={{ fontSize: square ? 92 : 80, fontWeight: 700, color: colour, lineHeight: 1.05, marginTop: 14, display: "flex" }}>{words[status]}</div>
          {detail ? <div style={{ fontSize: 36, color: "#c3c9d8", marginTop: 14, display: "flex" }}>{detail}</div> : null}
          <div style={{ fontSize: 30, color: "#7d869c", marginTop: 40, display: "flex" }}>Light Dey?  ·  {words.tag}</div>
        </div>
      </div>
    ),
    { width: w, height: h, headers: { "cache-control": "public, max-age=0, s-maxage=120, stale-while-revalidate=300" } },
  );
}
