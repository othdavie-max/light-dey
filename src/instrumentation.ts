// Runs on the server. Next.js calls onRequestError whenever a page or API route crashes; we keep a note of it.
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (err, request) => {
  const { logError } = await import("@/lib/errorLog");
  const e = err as Error & { digest?: string };
  await logError({ source: "server", message: `${e.message ?? String(err)} (${request.method} ${request.path})`, stack: e.stack, path: request.path });
};
