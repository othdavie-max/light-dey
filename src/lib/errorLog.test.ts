import { describe, expect, it } from "vitest";
import { cleanPath, fingerprint, scrub, shortAgent } from "./errorScrub";

describe("scrub", () => {
  it("removes emails, ids, tokens and long secrets", () => {
    const s = scrub("fail for a.b@example.com user 8fafebf3-08fc-4f88-a0bc-0ca7ec26c1f2 token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghij key AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", 500);
    expect(s).not.toMatch(/example\.com|8fafebf3|eyJ|AAAAAAAA/);
    expect(s).toContain("[email]");
    expect(s).toContain("[id]");
  });
  it("hides secret query values and cuts to the length limit", () => {
    expect(scrub("GET /x?token=abc123&ok=1", 100)).toBe("GET /x?token=[x]&ok=1");
    expect(scrub("ab ".repeat(30), 10)).toHaveLength(10);
  });
});

describe("fingerprint", () => {
  it("is the same for the same crash even when numbers differ", () => {
    expect(fingerprint("browser", "Cannot read 42 of undefined", "Error\n at f (a.js:10:5)")).toBe(fingerprint("browser", "Cannot read 97 of undefined", "Error\n at f (a.js:99:7)"));
  });
  it("differs for different crashes and different sources", () => {
    const a = fingerprint("browser", "A broke", "Error\n at f (a.js:1:1)");
    expect(a).not.toBe(fingerprint("browser", "B broke", "Error\n at f (a.js:1:1)"));
    expect(a).not.toBe(fingerprint("server", "A broke", "Error\n at f (a.js:1:1)"));
  });
});

describe("shortAgent and cleanPath", () => {
  it("describes phones without the full user agent", () => {
    expect(shortAgent("Mozilla/5.0 (Linux; Android 13; Infinix X669) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36")).toBe("Chrome on Android mobile");
    expect(shortAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17 Mobile Safari/604.1")).toBe("Safari on iOS mobile");
    expect(shortAgent(null)).toBe("unknown");
  });
  it("keeps only the page path", () => {
    expect(cleanPath("https://light-dey-umber.vercel.app/spot/abc?ref=12345678&x=1")).toBe("/spot/abc");
    expect(cleanPath(null)).toBeNull();
  });
});
