"use client";
import { useEffect } from "react";
import { captureInvite } from "@/lib/invite";

/** Invisible. Remembers an invite code from the link (?ref=CODE) on every page. */
export default function InviteCapture() {
  useEffect(() => { captureInvite(); }, []);
  return null;
}
