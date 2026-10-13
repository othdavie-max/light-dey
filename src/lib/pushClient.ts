"use client";
import { supabase, ensureSession } from "./supabase/browser";
import { appConfig } from "../../config/app.config";

export type PushResult = "ok" | "denied" | "unsupported" | "full" | "error";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
}

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export interface FollowState { following: boolean; alertOnGo: boolean }

export async function getFollow(spotId: string): Promise<FollowState> {
  const sb = supabase();
  const { data: s } = await sb.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) return { following: false, alertOnGo: false };
  const { data } = await sb.from("follows").select("alert_on_go").eq("user_id", uid).eq("spot_id", spotId).maybeSingle();
  return data ? { following: true, alertOnGo: !!data.alert_on_go } : { following: false, alertOnGo: false };
}

/** Follow a spot: ask permission, subscribe this phone, and save the follow. */
export async function startFollowing(spotId: string, alertOnGo = false): Promise<PushResult> {
  if (!pushSupported()) return "unsupported";
  try {
    const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm !== "granted") return "denied";
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) });
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return "error";
    await ensureSession();
    const sb = supabase();
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return "error";
    const { data: mine } = await sb.from("follows").select("spot_id").eq("user_id", u.user.id);
    const already = (mine ?? []).some((f) => f.spot_id === spotId);
    if (!already && (mine ?? []).length >= appConfig.push.maxFollowsPerPerson) return "full";
    await sb.from("push_subscriptions").delete().eq("endpoint", json.endpoint);
    const s = await sb.from("push_subscriptions").insert({ user_id: u.user.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth });
    if (s.error) return "error";
    const f = await sb.from("follows").upsert({ user_id: u.user.id, spot_id: spotId, alert_on_come: true, alert_on_go: alertOnGo });
    return f.error ? "error" : "ok";
  } catch {
    return "error";
  }
}

export async function setAlertOnGo(spotId: string, alertOnGo: boolean): Promise<boolean> {
  const sb = supabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return false;
  const r = await sb.from("follows").update({ alert_on_go: alertOnGo }).eq("user_id", u.user.id).eq("spot_id", spotId);
  return !r.error;
}

export async function stopFollowing(spotId: string): Promise<boolean> {
  const sb = supabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return false;
  const r = await sb.from("follows").delete().eq("user_id", u.user.id).eq("spot_id", spotId);
  return !r.error;
}
