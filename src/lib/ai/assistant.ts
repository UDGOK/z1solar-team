import { prisma } from "@/lib/prisma";
import { formatDate, formatInstantDate } from "../time";
import type { CurrentMember } from "@/lib/auth";
import { getViewableProjectIds, getGlobalCapabilities, getProjectPermissions } from "@/lib/permissions";

/**
 * The team assistant.
 *
 * The single most important property: the model only ever receives data the
 * person asking is already allowed to see. Context is built from their
 * viewable projects, and financial figures are included only where they hold
 * canViewFinancials on that specific project.
 *
 * This matters because an assistant is a permission bypass waiting to happen —
 * someone with no financial access could otherwise just ask "what's the budget
 * on Mead?" and get an answer the UI would never show them.
 */

const API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";
const TIMEOUT_MS = 45_000;

export function isChatConfigured(): boolean {
  return !!process.env.DEEPSEEK_API_KEY;
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Assembles a snapshot of what this person can see, as plain text. */
export async function buildContext(member: CurrentMember): Promise<string> {
  const isAdmin = member.role === "ADMIN";
  const caps = await getGlobalCapabilities(member);
  const viewableIds = await getViewableProjectIds(member);

  const [projects, myTasks, meetings, shows] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: viewableIds }, archived: false },
      include: {
        lead: { select: { name: true } },
        todos: { where: { done: false }, select: { text: true, dueDate: true } },
      },
      orderBy: { title: "asc" },
    }),
    prisma.todo.findMany({
      where: { done: false, assignees: { some: { memberId: member.id } } },
      include: { project: { select: { title: true } } },
      orderBy: { dueDate: "asc" },
      take: 25,
    }),
    prisma.meeting.findMany({
      where: { startsAt: { gte: new Date(Date.now() - 30 * 86400000) } },
      orderBy: { startsAt: "desc" },
      take: 10,
      select: { title: true, startsAt: true, notes: true, status: true },
    }),
    // Trade shows are fetched separately, behind a permission check — see below.
    Promise.resolve([] as any[]),
  ]);

  const lines: string[] = [];
  lines.push(`You are talking to ${member.name}${isAdmin ? " (administrator)" : ""}.`);
  lines.push(`Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}.`);
  lines.push("");
  lines.push(`## Projects visible to this person (${projects.length})`);

  for (const p of projects) {
    // Resolve financial visibility per project — it varies, and a blanket
    // check would either leak or over-restrict.
    const perms = isAdmin ? null : await getProjectPermissions(member, p.id);
    const canSeeMoney = isAdmin || caps.canViewAllFinancials || perms?.canViewFinancials;

    const bits = [
      `${p.code ? `[${p.code}] ` : ""}${p.title}`,
      `category: ${p.category}`,
      `status: ${p.status}`,
      `progress: ${p.completionPct}%`,
      `priority: ${p.priority}`,
      `lead: ${p.lead?.name ?? "unassigned"}`,
    ];
    if (canSeeMoney) {
      bits.push(`budget: ${money(p.estBudget)}`, `committed: ${money(p.committed)}`, `spent: ${money(p.actualSpend)}`);
    }
    if (p.city || p.state) bits.push(`location: ${[p.city, p.state].filter(Boolean).join(", ")}`);
    lines.push(`- ${bits.join(" · ")}`);
    if (p.todos.length) {
      lines.push(`    open tasks: ${p.todos.slice(0, 5).map((t) => t.text).join("; ")}`);
    }
  }

  if (myTasks.length) {
    lines.push("");
    lines.push(`## ${member.name}'s own open tasks`);
    for (const t of myTasks) {
      lines.push(`- ${t.text} (${t.project.title})${t.dueDate ? ` — due ${t.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}`);
    }
  }

  if (meetings.length) {
    lines.push("");
    lines.push("## Recent and upcoming meetings");
    for (const m of meetings) {
      lines.push(`- ${m.title} — ${formatInstantDate(m.startsAt)} (${m.status})${m.notes ? `\n    notes: ${m.notes.slice(0, 400)}` : ""}`);
    }
  }

  // ---- Trade shows and exhibitors -----------------------------------------
  //
  // Gated. This block used to run unconditionally, which meant somebody with no
  // trade show access could ask the assistant about shows and be answered. The
  // rule here matches the module itself: holding canViewTradeShows, or being on
  // a given show's attendee list.
  //
  // Nothing is filtered out AFTER the model sees it. Anything this person may
  // not see is never fetched, so there is nothing for the model to leak.
  {
    const record = await prisma.teamMember.findUnique({
      where: { id: member.id },
      select: { canViewTradeShows: true, canManageTradeShows: true },
    });
    const attending = await prisma.tradeShowAttendee.findMany({
      where: { memberId: member.id, status: { not: "Declined" } },
      select: { tradeShowId: true },
    });
    const attendingIds = attending.map((a) => a.tradeShowId);
    const canSeeAllShows = isAdmin || !!record?.canViewTradeShows;

    if (canSeeAllShows || attendingIds.length > 0) {
      const visibleShows = await prisma.tradeShow.findMany({
        where: canSeeAllShows
          ? { startDate: { gte: new Date() } }
          : { id: { in: attendingIds } },
        orderBy: { startDate: "asc" },
        take: 8,
        select: {
          id: true, name: true, startDate: true, city: true, state: true,
          priority: true, status: true,
        },
      });

      if (visibleShows.length) {
        lines.push("");
        lines.push("## Upcoming trade shows");
        for (const s of visibleShows) {
          lines.push(
            `- ${s.name} — ${formatDate(s.startDate)}${s.city ? `, ${s.city}` : ""} · ${s.priority} priority · ${s.status}`
          );
        }

        // Only the meetings we actually want, not all 811 companies — the full
        // directory would swamp the context and is better answered on the page.
        const flagged = await prisma.tradeShowExhibitor.findMany({
          where: { tradeShowId: { in: visibleShows.map((s) => s.id) }, meetingWanted: true },
          include: {
            vendor: {
              select: {
                name: true, description: true, reputationScore: true,
                riskNotes: true, riskSource: true,
              },
            },
            tradeShow: { select: { name: true } },
            owners: { include: { member: { select: { name: true } } } },
            projects: { include: { project: { select: { title: true } } } },
          },
          orderBy: { booth: "asc" },
          take: 60,
        });

        if (flagged.length) {
          lines.push("");
          lines.push("## Vendors we want to meet at those shows");
          for (const e of flagged) {
            const owners = e.owners.map((o) => o.member.name).join(", ") || "nobody assigned";
            const projects = e.projects.map((p) => p.project.title).join(", ");
            // The score is passed WITH its provenance, so the assistant can't
            // present a generated number as an established fact.
            const score =
              e.vendor.reputationScore !== null
                ? ` · standing ${e.vendor.reputationScore}/100 (${e.vendor.riskSource === "manual" ? "checked by a person" : "AI-generated, unverified"})`
                : "";
            lines.push(
              `- ${e.vendor.name} — ${e.tradeShow.name}${e.booth ? ` booth ${e.booth}` : ""} · ${e.meetingStatus} · chased by ${owners}${projects ? ` · about ${projects}` : ""}${score}`
            );
            if (e.vendor.description) lines.push(`    what they do: ${e.vendor.description.slice(0, 200)}`);
            if (e.notes) lines.push(`    what we want: ${e.notes.slice(0, 200)}`);
            if (e.vendor.riskNotes) lines.push(`    risk note (${e.vendor.riskSource === "manual" ? "checked" : "unverified"}): ${e.vendor.riskNotes.slice(0, 200)}`);
          }
        }
      }
    }
  }

  // Purchases only for people who can see spend.
  if (isAdmin || caps.canViewAllPurchases || caps.canApprovePurchases) {
    const pending = await prisma.purchaseRequest.findMany({
      where: { status: "SUBMITTED" },
      include: { project: { select: { title: true } }, requestedBy: { select: { name: true } } },
      take: 15,
    });
    if (pending.length) {
      lines.push("");
      lines.push("## Purchases awaiting approval");
      for (const p of pending) {
        lines.push(`- ${p.title} — ${money(p.amount)} · requested by ${p.requestedBy?.name ?? "—"}${p.project ? ` · ${p.project.title}` : ""}`);
      }
    }
  }

  return lines.join("\n");
}

const SYSTEM = `You are the Z1Power team assistant, built into the company's internal project management app.

Z1Power (SZH Holdings) develops solar, battery storage and data centre projects.

How to answer:
- Use the project data provided below when the question relates to the company's work. Be specific — cite project names, numbers and dates from the data.
- If the data doesn't contain the answer, say so plainly rather than guessing. Never invent a figure, date, status or person.
- You can also answer general questions unrelated to the company — industry knowledge, technical questions, drafting help. Be genuinely useful.
- Keep answers concise and practical. This is a working tool, not a chat companion.
- The data below is scoped to what this specific person is permitted to see. If they ask about something not in it, say you don't have visibility rather than speculating — do not suggest they may lack permission, just say you don't have that information.
- Money figures are USD.
- Vendor standing scores marked "AI-generated, unverified" are a language model's impression, not research. If you cite one, say so in the same breath. Never present an unverified score or risk note as established fact, and never repeat a risk note about a named company without that caveat.`;

export type ChatTurn = { role: "user" | "assistant"; content: string };

export async function askAssistant(
  member: CurrentMember,
  history: ChatTurn[],
  question: string
): Promise<{ ok: boolean; answer?: string; error?: string }> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return { ok: false, error: "The assistant isn't configured yet." };
  if (!question.trim()) return { ok: false, error: "Ask a question first." };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const context = await buildContext(member);

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: `${SYSTEM}\n\n---\n\n${context}` },
          // Recent turns only — enough for follow-ups without an unbounded prompt.
          ...history.slice(-8).map((h) => ({ role: h.role, content: h.content })),
          { role: "user", content: question },
        ],
        temperature: 0.3,
        max_tokens: 1200,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error("[assistant] DeepSeek returned", res.status);
      return { ok: false, error: "The assistant couldn't be reached. Try again in a moment." };
    }

    const data: any = await res.json();
    const answer: string | undefined = data?.choices?.[0]?.message?.content;
    if (!answer?.trim()) return { ok: false, error: "No answer came back. Try rephrasing." };

    return { ok: true, answer: answer.trim() };
  } catch (e: any) {
    if (e?.name === "AbortError") return { ok: false, error: "That took too long. Try a shorter question." };
    console.error("[assistant] failed:", e);
    return { ok: false, error: "Something went wrong reaching the assistant." };
  } finally {
    clearTimeout(timer);
  }
}
