/**
 * Shared constants for the exhibitor module.
 *
 * Deliberately NOT in actions.ts: a "use server" file may only export async
 * functions, so exporting a plain array from there fails the build with a
 * message that points at the export rather than the rule. Constants live here
 * and are imported by both the server actions and the client components.
 */

/** The tag list seeded on first use. Fully editable afterwards in Settings. */
export const DEFAULT_TAGS = [
  "Inverters",
  "BESS",
  "Modules",
  "Racking",
  "Trackers",
  "BOS",
  "Switchgear",
  "Transformers",
  "Generation",
  "Cooling",
  "Data Centre",
  "EPC",
  "O&M",
  "Financing",
  "Legal",
  "Software",
  "Fibre & Telecom",
  "Manufacturer",
  "Developer",
  "Consulting",
];

export const MEETING_STATUSES = [
  "To arrange",
  "Requested",
  "Scheduled",
  "Met",
  "No longer needed",
] as const;

export type MeetingStatus = (typeof MEETING_STATUSES)[number];

/** Statuses that still need action, used for the "outstanding" count. */
export const OPEN_MEETING_STATUSES: readonly string[] = [
  "To arrange",
  "Requested",
  "Scheduled",
];

export const LISTING_TYPES = ["Exhibitor", "Sponsor", "Both"] as const;

export const PRIORITIES = ["High", "Medium", "Low"] as const;
