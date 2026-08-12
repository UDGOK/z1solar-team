import { prisma } from "./prisma";

/** Someone counts as "online" if they've loaded a page in this window. */
export const ONLINE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Don't write to the database more often than this per person. Without it,
 * every page load would be an extra write — for a team clicking around, that's
 * a lot of pointless traffic to Neon for a timestamp nobody reads that precisely.
 */
const WRITE_THROTTLE_MS = 60 * 1000; // 1 minute

/**
 * Last write time per member, held in module memory.
 *
 * Serverless caveat: each Vercel instance keeps its own copy, and instances
 * recycle. Worst case we write a bit more often than the throttle implies —
 * which is harmless. The database remains the source of truth.
 */
const lastWrite = new Map<string, number>();

/**
 * Records that this member is active. Deliberately never throws: presence is a
 * nice-to-have, and a failed timestamp update must not break the page the
 * person was actually trying to load.
 */
export async function touchPresence(memberId: string): Promise<void> {
  try {
    const now = Date.now();
    const previous = lastWrite.get(memberId) ?? 0;
    if (now - previous < WRITE_THROTTLE_MS) return;
    lastWrite.set(memberId, now);

    // Guard against unbounded growth if the process is long-lived.
    if (lastWrite.size > 500) {
      for (const [k, v] of Array.from(lastWrite.entries())) {
        if (now - v > WRITE_THROTTLE_MS * 10) lastWrite.delete(k);
      }
    }

    await prisma.teamMember.update({
      where: { id: memberId },
      data: { lastSeenAt: new Date() },
    });
  } catch {
    // Silent by design — see note above.
  }
}

export type PresenceState = "online" | "recent" | "away" | "never";

export function presenceFrom(lastSeenAt: Date | null): { state: PresenceState; label: string } {
  if (!lastSeenAt) return { state: "never", label: "Never signed in" };

  const mins = Math.floor((Date.now() - lastSeenAt.getTime()) / 60000);
  if (mins < 5) return { state: "online", label: "Online now" };
  if (mins < 60) return { state: "recent", label: `${mins}m ago` };

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { state: "away", label: `${hrs}h ago` };

  const days = Math.floor(hrs / 24);
  if (days === 1) return { state: "away", label: "Yesterday" };
  if (days < 30) return { state: "away", label: `${days}d ago` };
  return {
    state: "away",
    label: lastSeenAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
  };
}

export const PRESENCE_COLOR: Record<PresenceState, string> = {
  online: "#4CAB3E",
  recent: "#E8743B",
  away: "#8A8A85",
  never: "#D8D8D2",
};
