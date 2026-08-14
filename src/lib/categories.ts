/**
 * Category colours and display order for the sidebar and dashboard sections.
 *
 * Kept as a lookup with a fallback rather than a hard-coded union so an admin
 * can create a new category from the project form without this file needing a
 * code change — unknown categories just get the neutral grey.
 */
export const CATEGORY_COLOR: Record<string, string> = {
  "Solar & Battery": "#4CAB3E",
  "Data Centers": "#3F9634",
  Certifications: "#E8743B",
  International: "#1C1C1C",
  "Other Projects": "#3F9634",
  "Other Matters": "#8A8A85",
  "New Project": "#E8743B",
};

/** Lower sorts first. Anything unlisted lands after the known ones, alphabetically. */
const ORDER = [
  "Solar & Battery",
  "Data Centers",
  "Certifications",
  "International",
  "Other Projects",
  "Other Matters",
  "New Project",
];

export function categoryColor(name: string): string {
  return CATEGORY_COLOR[name] ?? "#8A8A85";
}

export function sortCategories(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ia = ORDER.indexOf(a);
    const ib = ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}
