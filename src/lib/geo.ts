import type { AreaLite } from "./search";

export interface Coord { lat: number; lng: number }

/** Straight-line distance in km (haversine). */
export function distanceKm(a: Coord, b: Coord): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Areas near a point, closest first. Used ONLY to suggest areas: the position is rounded to roughly
 * 1 km before use, stays in the browser, and is never sent anywhere or stored.
 */
export function nearestAreas(areas: AreaLite[], here: Coord, max = 5, maxKm = 30): (AreaLite & { km: number })[] {
  const coarse = { lat: Math.round(here.lat * 100) / 100, lng: Math.round(here.lng * 100) / 100 };
  return areas
    .filter((a): a is AreaLite & { lat: number; lng: number } => a.lat !== null && a.lng !== null)
    .map((a) => ({ ...a, km: Math.round(distanceKm(coarse, { lat: a.lat, lng: a.lng }) * 10) / 10 }))
    .filter((a) => a.km <= maxKm)
    .sort((x, y) => x.km - y.km)
    .slice(0, max);
}
