// npm run test:e2e
// Builds a private test copy of the app, starts it, runs every end-to-end test against your real database
// (using throwaway users and spots that are removed afterwards), then stops it.
// It uses Cloudflare's official always-pass test keys for the bot check, so no real keys are touched.
// Needs: no other copy of the app running on port 3000, and the .env.local file filled in.
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 3000;
const env = {
  ...process.env,
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",          // Cloudflare's published "always passes" test keys
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  BASE_URL: `http://localhost:${PORT}`,
};
const next = ["node_modules/next/dist/bin/next"];

console.log("1/3 Building a test copy of the app (about a minute)...");
const build = spawnSync(process.execPath, [...next, "build"], { env, stdio: "inherit" });
if (build.status !== 0) { console.error("The build failed. Fix that first."); process.exit(1); }

console.log("2/3 Starting it...");
const server = spawn(process.execPath, [...next, "start", "-p", String(PORT)], { env, stdio: "ignore" });
let up = false;
for (let i = 0; i < 40 && !up; i++) {
  await sleep(500);
  try { up = (await fetch(env.BASE_URL)).ok; } catch { /* not ready yet */ }
}
if (!up) { server.kill(); console.error(`Could not start the app on port ${PORT}. Is another copy already running?`); process.exit(1); }

console.log("3/3 Running the tests...\n");
let failed = 0;
for (const name of ["test-report", "test-onboarding", "test-admin", "test-me"]) {
  console.log(`=== ${name} ===`);
  const r = spawnSync(process.execPath, ["--env-file=.env.local", `scripts/${name}.mjs`], { env, stdio: "inherit" });
  if (r.status !== 0) failed++;
  console.log("");
}
server.kill();
console.log(failed ? `${failed} test suite(s) FAILED.` : "All end-to-end tests passed.");
process.exit(failed ? 1 : 0);
