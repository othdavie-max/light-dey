export interface AreaLite {
  id: number;
  name: string;
  city: string | null;
  lga: string;
  state: string;
  lat: number | null;
  lng: number | null;
}

/** Lowercase, drop accents and punctuation, collapse spaces: "Wuse 2" and "wuse-2" match each other. */
export function normalize(s: string): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Search areas as the person types. Best matches first:
 * exact name, name starts with the text, a word in the name starts with it, name contains it,
 * then matches on the LGA, city or state (so typing "abuja" or "AMAC" lists areas there).
 */
export function searchAreas(areas: AreaLite[], query: string, max = 8): AreaLite[] {
  const q = normalize(query);
  if (!q) return [];
  const scored: { a: AreaLite; score: number }[] = [];
  for (const a of areas) {
    const name = normalize(a.name);
    let score = 0;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.split(" ").some((w) => w.startsWith(q))) score = 60;
    else if (name.includes(q)) score = 40;
    else if ([a.lga, a.city ?? "", a.state].some((x) => normalize(x).startsWith(q))) score = 20;
    else if ([a.lga, a.city ?? "", a.state].some((x) => normalize(x).includes(q))) score = 10;
    if (score > 0) scored.push({ a, score });
  }
  return scored
    .sort((x, y) => y.score - x.score || x.a.name.localeCompare(y.a.name))
    .slice(0, max)
    .map((s) => s.a);
}
