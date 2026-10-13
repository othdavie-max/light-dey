import { describe, expect, it } from "vitest";
import { normalize, searchAreas, type AreaLite } from "./search";
import { distanceKm, nearestAreas } from "./geo";

const area = (id: number, name: string, lga: string, city: string, lat: number | null = null, lng: number | null = null): AreaLite =>
  ({ id, name, lga, city, state: city === "Lagos" ? "Lagos" : "Federal Capital Territory", lat, lng });

const AREAS = [
  area(1, "Wuye", "AMAC", "Abuja", 9.083, 7.445),
  area(2, "Wuse", "AMAC", "Abuja", 9.064, 7.472),
  area(3, "Wuse 2", "AMAC", "Abuja", 9.079, 7.473),
  area(4, "Garki", "AMAC", "Abuja", 9.027, 7.49),
  area(5, "Lekki Phase 1", "Eti-Osa", "Lagos", 6.447, 3.47),
  area(6, "Lekki Phase 2", "Eti-Osa", "Lagos", 6.456, 3.51),
  area(7, "Yaba", "Lagos Mainland", "Lagos", 6.51, 3.379),
  area(8, "Kuje", "Kuje", "Abuja"),
];

describe("normalize", () => {
  it("makes spellings comparable", () => {
    expect(normalize("  Wuse-2 ")).toBe("wuse 2");
    expect(normalize("Ikeja GRA")).toBe("ikeja gra");
    expect(normalize("Café")).toBe("cafe");
    expect(normalize("Ado-Odo/Ota")).toBe("ado odo ota");
  });
});

describe("searchAreas", () => {
  it("returns nothing for an empty search", () => {
    expect(searchAreas(AREAS, "   ")).toEqual([]);
  });
  it("puts an exact name first", () => {
    expect(searchAreas(AREAS, "wuse")[0].name).toBe("Wuse");
  });
  it("finds names that start with what was typed", () => {
    expect(searchAreas(AREAS, "wu").map((a) => a.name)).toEqual(["Wuse", "Wuse 2", "Wuye"]);
  });
  it("matches on any word in the name", () => {
    expect(searchAreas(AREAS, "phase").map((a) => a.name)).toEqual(["Lekki Phase 1", "Lekki Phase 2"]);
  });
  it("is not fussy about capitals or dashes", () => {
    expect(searchAreas(AREAS, "WUSE-2")[0].name).toBe("Wuse 2");
  });
  it("finds areas by city, LGA or state when the name does not match", () => {
    expect(searchAreas(AREAS, "lagos").map((a) => a.id).sort()).toEqual([5, 6, 7]);
    expect(searchAreas(AREAS, "eti").map((a) => a.id).sort()).toEqual([5, 6]);
  });
  it("ranks a name match above a city match", () => {
    const list = [area(1, "Abuja Road", "X", "Lagos"), area(2, "Garki", "AMAC", "Abuja")];
    expect(searchAreas(list, "abuja")[0].name).toBe("Abuja Road");
  });
  it("respects the maximum", () => {
    expect(searchAreas(AREAS, "a", 2)).toHaveLength(2);
  });
});

describe("distanceKm", () => {
  it("is 0 for the same point", () => {
    expect(distanceKm({ lat: 9, lng: 7 }, { lat: 9, lng: 7 })).toBe(0);
  });
  it("is about 700 km between Abuja and Lagos", () => {
    const d = distanceKm({ lat: 9.0765, lng: 7.3986 }, { lat: 6.5244, lng: 3.3792 });
    expect(d).toBeGreaterThan(520);
    expect(d).toBeLessThan(600);
  });
});

describe("nearestAreas", () => {
  it("suggests the closest areas first", () => {
    const near = nearestAreas(AREAS, { lat: 9.082, lng: 7.446 });
    expect(near[0].name).toBe("Wuye");
    expect(near.map((a) => a.name)).not.toContain("Yaba");
  });
  it("only suggests Abuja when standing in Abuja", () => {
    expect(nearestAreas(AREAS, { lat: 9.07, lng: 7.47 }, 10).every((a) => a.city === "Abuja")).toBe(true);
  });
  it("skips areas with no coordinates", () => {
    expect(nearestAreas(AREAS, { lat: 8.88, lng: 7.24 }, 10, 500).map((a) => a.name)).not.toContain("Kuje");
  });
  it("suggests nothing when far from every area", () => {
    expect(nearestAreas(AREAS, { lat: 12, lng: 8.5 })).toEqual([]);
  });
  it("rounds the position before using it (distance is the same for tiny moves)", () => {
    const a = nearestAreas(AREAS, { lat: 9.0801, lng: 7.4451 })[0].km;
    const b = nearestAreas(AREAS, { lat: 9.0803, lng: 7.4453 })[0].km;
    expect(a).toBe(b);
  });
});
