import { prisma } from "@/lib/prisma";
import { normalizePhone } from "./twilio";

const SESSION_HOURS = 8;

export type Sender =
  | { kind: "member"; id: string; name: string; optedOut: boolean }
  | { kind: "contact"; id: string; name: string; allowedProjectIds: string[] | null; optedOut: boolean }
  | { kind: "unknown" };

/**
 * Who is this? Team members first, then the approved-contact allowlist.
 * Anything else is "unknown" and gets rejected by the webhook — an open inbox
 * would mean spam, cost, and untrusted writes into project records.
 */
export async function identifySender(phoneRaw: string): Promise<Sender> {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return { kind: "unknown" };

  // Team member phones are free-text in the UI, so compare normalised forms
  // rather than relying on how they happened to be typed.
  const members = await prisma.teamMember.findMany({
    where: { phone: { not: null } },
    select: { id: true, name: true, phone: true, smsEnabled: true, smsOptedOut: true },
  });
  const member = members.find((m) => normalizePhone(m.phone) === phone);
  if (member && member.smsEnabled) {
    return { kind: "member", id: member.id, name: member.name, optedOut: member.smsOptedOut };
  }

  const contact = await prisma.smsContact.findUnique({ where: { phone } });
  if (contact && contact.active) {
    return {
      kind: "contact",
      id: contact.id,
      name: contact.name,
      allowedProjectIds: contact.projectIds ? contact.projectIds.split(",").filter(Boolean) : null,
      optedOut: contact.optedOut,
    };
  }

  return { kind: "unknown" };
}

export type Routed = {
  projectId: string | null;
  routedBy: "keyword" | "session" | "reply" | "none";
  cleanBody: string;
  /** Set when we need to ask which project; the webhook replies with this. */
  askChoices?: { id: string; title: string }[];
};

/**
 * Resolves which project an inbound message belongs to.
 *
 * Order matters and is deliberate: an explicit keyword always wins so someone
 * can switch sites mid-conversation, then the running session (because field
 * texts arrive in bursts about one site), then a numbered reply to a question
 * we asked earlier.
 */
export async function routeMessage(
  phoneRaw: string,
  body: string,
  visibleProjectIds: string[]
): Promise<Routed> {
  const phone = normalizePhone(phoneRaw)!;
  const trimmed = body.trim();

  const projects = await prisma.project.findMany({
    where: { archived: false, id: { in: visibleProjectIds } },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });

  const session = await prisma.smsSession.findUnique({ where: { phone } });
  const sessionLive = session && session.expiresAt > new Date();

  // --- A bare digit answering "which project?" ---
  if (sessionLive && session!.pendingChoices) {
    const digit = trimmed.match(/^(\d{1,2})$/);
    if (digit) {
      const ids = session!.pendingChoices.split(",").filter(Boolean);
      const picked = ids[Number(digit[1]) - 1];
      if (picked && projects.some((p) => p.id === picked)) {
        return {
          projectId: picked,
          routedBy: "reply",
          // The message we were holding while we asked.
          cleanBody: session!.pendingBody || trimmed,
        };
      }
    }
  }

  // --- Explicit keyword: "MEAD: text" or "#MEAD text" ---
  const kw = trimmed.match(/^#?\s*([A-Za-z0-9 &().'-]{2,40}?)\s*[:\-–]\s*([\s\S]+)$/);
  if (kw) {
    const key = kw[1].trim().toLowerCase();
    const rest = kw[2].trim();
    const match = findProject(projects, key);
    if (match) return { projectId: match.id, routedBy: "keyword", cleanBody: rest };
  }

  // --- Running session ---
  if (sessionLive && session!.projectId && projects.some((p) => p.id === session!.projectId)) {
    return { projectId: session!.projectId, routedBy: "session", cleanBody: trimmed };
  }

  // --- Nothing matched: ask, offering the most relevant projects ---
  return {
    projectId: null,
    routedBy: "none",
    cleanBody: trimmed,
    askChoices: projects.slice(0, 5).map((p) => ({ id: p.id, title: p.title })),
  };
}

/**
 * Matches a keyword to a project. Exact title first, then "starts with", then
 * a first-word match so "MEAD" finds "Data Center, OK (Mead)" — deliberately
 * conservative, because filing a field note against the wrong project is worse
 * than asking.
 */
function findProject(projects: { id: string; title: string }[], key: string) {
  const lower = projects.map((p) => ({ ...p, l: p.title.toLowerCase() }));

  const exact = lower.find((p) => p.l === key);
  if (exact) return exact;

  const starts = lower.filter((p) => p.l.startsWith(key));
  if (starts.length === 1) return starts[0];

  const contains = lower.filter((p) => p.l.includes(key));
  if (contains.length === 1) return contains[0];

  // Match on any significant word, e.g. "mead" or "carson".
  if (key.length >= 3) {
    const word = lower.filter((p) => p.l.split(/[^a-z0-9]+/).includes(key));
    if (word.length === 1) return word[0];
  }
  return null;
}

export async function openSession(phone: string, projectId: string) {
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000);
  await prisma.smsSession.upsert({
    where: { phone },
    create: { phone, projectId, expiresAt },
    update: { projectId, expiresAt, pendingChoices: null, pendingBody: null },
  });
}

export async function setPending(phone: string, choices: string[], body: string) {
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000);
  await prisma.smsSession.upsert({
    where: { phone },
    create: { phone, expiresAt, pendingChoices: choices.join(","), pendingBody: body },
    update: { expiresAt, pendingChoices: choices.join(","), pendingBody: body },
  });
}

export async function rememberTask(phone: string, taskId: string) {
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000);
  await prisma.smsSession.upsert({
    where: { phone },
    create: { phone, lastTaskId: taskId, expiresAt },
    update: { lastTaskId: taskId, expiresAt },
  });
}
