"use client";
import { useEffect } from "react";
import Link from "next/link";
import { reportError } from "@/lib/reportError";

// Shown if a page crashes, instead of a blank screen.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportError(error.message, error.stack); }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-5 text-center">
      <h1 className="text-[22px] font-medium">Something went wrong</h1>
      <p className="mt-2 text-[15px] text-muted">No wahala, your reports are safe. Try again.</p>
      <button onClick={reset} className="press panel mt-6 inline-flex min-h-12 items-center rounded-2xl px-6 text-[16px] font-medium">Try again</button>
      <Link href="/" className="press mt-2 inline-flex min-h-12 items-center px-6 text-[15px] text-muted underline">Go to home</Link>
    </main>
  );
}
