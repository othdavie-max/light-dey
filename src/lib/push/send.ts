// SERVER ONLY. Sends "Light don come" / "Light don go" alerts to the people following a spot.
import webpush from "web-push";
import { adminClient } from "@/lib/supabase/admin";
import { selectRecipients, alertText, type Follower, type Spotstate } from "./select";

let ready = false;
function configure(): boolean {
  if (ready) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;                              // push not set up on this server: quietly do nothing
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "https://light-dey-umber.vercel.app", pub, priv);
  ready = true;
  return true;
}

export async function notifyFollowers(args: { spotId: string; spotName: string; oldStatus: Spotstate; newStatus: Spotstate; reporterId: string; now: Date }) {
  try {
    if (!configure()) return { sent: 0 };
    const db = adminClient();
    const { data: follows } = await db.from("follows")
      .select("user_id,alert_on_come,alert_on_go,quiet_enabled,quiet_start,quiet_end,last_notified_at").eq("spot_id", args.spotId);
    const pick = selectRecipients((follows ?? []) as Follower[], { oldStatus: args.oldStatus, newStatus: args.newStatus, reporterId: args.reporterId, now: args.now });
    if (!pick || pick.userIds.length === 0) return { sent: 0 };

    const [{ data: subs }, { data: profs }] = await Promise.all([
      db.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth").in("user_id", pick.userIds),
      db.from("profiles").select("id,language").in("id", pick.userIds),
    ]);
    const lang = new Map((profs ?? []).map((p) => [p.id as string, (p.language as "en" | "pcm") ?? "pcm"]));
    let sent = 0;
    const notified = new Set<string>();
    await Promise.all((subs ?? []).map(async (s) => {
      const text = alertText(pick.kind, args.spotName, lang.get(s.user_id) ?? "pcm", args.newStatus === "weak");
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ ...text, url: `/spot/${args.spotId}`, tag: `spot-${args.spotId}` }),
          { TTL: 3600, urgency: "high" },
        );
        sent++; notified.add(s.user_id);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id);     // phone unsubscribed
      }
    }));
    if (notified.size) await db.from("follows").update({ last_notified_at: args.now.toISOString() }).eq("spot_id", args.spotId).in("user_id", [...notified]);
    return { sent };
  } catch {
    return { sent: 0 };
  }
}
