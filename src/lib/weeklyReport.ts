import { prisma } from "./prisma";
import { emailShell, escapeHtml, sendEmail } from "./email";

const GREEN = "#4CAB3E";
const GREEN_DARK = "#3F9634";
const INK = "#1C1C1C";
const INK_SOFT = "#3A3A3A";
const INK_FAINT = "#8A8A85";
const LINE = "#D8D8D2";
const TINT = "#F5F9F3";
const AMBER = "#E8743B";
const RED = "#C0392B";

const STATUS_COLOR: Record<string, string> = {
  Planning: "#8A8A85",
  "On Track": GREEN,
  "At Risk": AMBER,
  Delayed: RED,
  Complete: GREEN_DARK,
};

function money(n: number) {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function sectionTitle(t: string) {
  return `<p style="margin:20px 0 8px;font-size:11px;font-weight:700;letter-spacing:1.5px;color:${GREEN_DARK};text-transform:uppercase;">${t}</p>`;
}

/**
 * Builds one person's weekly digest for one project, including ONLY the
 * sections their subscription enables. Financials are additionally gated on
 * their actual project permission — a stale subscription can never leak
 * numbers the person isn't allowed to see.
 */
export async function buildProjectReportHtml(
  projectId: string,
  sub: {
    includeStatus: boolean;
    includeTasks: boolean;
    includeKeyDates: boolean;
    includeQuestions: boolean;
    includeFinancials: boolean;
  },
  canSeeFinancials: boolean
): Promise<{ html: string; projectTitle: string } | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      lead: { select: { name: true } },
      todos: { include: { assignees: { include: { member: { select: { name: true } } } } }, orderBy: { order: "asc" } },
      keyDates: { orderBy: { order: "asc" } },
      questions: { orderBy: { order: "asc" } },
    },
  });
  if (!project || project.archived) return null;

  const parts: string[] = [];

  if (sub.includeStatus) {
    const color = STATUS_COLOR[project.status] || GREEN;
    parts.push(sectionTitle("Status"));
    parts.push(`
      <table cellpadding="0" cellspacing="0" width="100%" style="background:${TINT};border-radius:6px;">
        <tr><td style="padding:14px 16px;">
          <span style="display:inline-block;padding:4px 10px;border-radius:4px;background:${color};color:#fff;font-size:11px;font-weight:700;letter-spacing:1px;">${project.status.toUpperCase()}</span>
          <span style="margin-left:10px;font-size:20px;font-weight:800;color:${INK};">${project.completionPct}%</span>
          <span style="font-size:13px;color:${INK_SOFT};"> complete</span>
          <div style="margin-top:10px;height:8px;background:#fff;border:1px solid ${LINE};border-radius:99px;overflow:hidden;">
            <div style="height:8px;width:${Math.max(0, Math.min(100, project.completionPct))}%;background:${color};"></div>
          </div>
          <p style="margin:10px 0 0;font-size:13px;color:${INK_SOFT};">Lead: <strong style="color:${INK};">${escapeHtml(project.lead?.name || "—")}</strong></p>
        </td></tr>
      </table>`);
  }

  if (sub.includeTasks) {
    const open = project.todos.filter((t) => !t.done);
    const doneCount = project.todos.length - open.length;
    const now = new Date();
    parts.push(sectionTitle(`Tasks — ${open.length} open, ${doneCount} done`));
    if (open.length === 0) {
      parts.push(`<p style="margin:0;font-size:13px;color:${INK_FAINT};">No open tasks.</p>`);
    } else {
      parts.push(
        `<table cellpadding="0" cellspacing="0" width="100%">` +
          open
            .slice(0, 12)
            .map((t) => {
              const overdue = t.dueDate && t.dueDate < now;
              const meta = [
                t.assignees.length ? escapeHtml(t.assignees.map((a) => a.member.name).join(", ")) : "unassigned",
                t.dueDate
                  ? `${overdue ? "OVERDUE " : "due "}${t.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return `<tr><td style="padding:7px 0;border-bottom:1px solid ${LINE};">
                <p style="margin:0;font-size:14px;color:${INK};">${escapeHtml(t.text)}</p>
                <p style="margin:2px 0 0;font-size:11px;color:${overdue ? RED : INK_FAINT};font-weight:${overdue ? 700 : 400};">${meta}</p>
              </td></tr>`;
            })
            .join("") +
          `</table>`
      );
      if (open.length > 12) {
        parts.push(`<p style="margin:8px 0 0;font-size:12px;color:${INK_FAINT};">…and ${open.length - 12} more.</p>`);
      }
    }
  }

  if (sub.includeKeyDates && project.keyDates.length) {
    parts.push(sectionTitle("Key Dates"));
    parts.push(
      `<table cellpadding="0" cellspacing="0" width="100%">` +
        project.keyDates
          .map(
            (k) => `<tr>
              <td style="padding:6px 0;border-bottom:1px solid ${LINE};width:100px;font-size:12px;color:${INK_FAINT};">${
              k.date ? k.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "TBD"
            }</td>
              <td style="padding:6px 0;border-bottom:1px solid ${LINE};font-size:13px;color:${INK_SOFT};">${escapeHtml(k.milestone)}</td>
            </tr>`
          )
          .join("") +
        `</table>`
    );
  }

  if (sub.includeQuestions) {
    const openQ = project.questions.filter((q) => !q.resolved);
    if (openQ.length) {
      parts.push(sectionTitle(`Open Questions — ${openQ.length}`));
      parts.push(
        openQ
          .slice(0, 8)
          .map((q) => `<p style="margin:0 0 6px;font-size:13px;color:${INK_SOFT};">• ${escapeHtml(q.text)}</p>`)
          .join("")
      );
    }
  }

  // Double gate: subscription says include AND the person actually has
  // financial permission on this project.
  if (sub.includeFinancials && canSeeFinancials) {
    const remaining = project.estBudget - project.actualSpend;
    parts.push(sectionTitle("Financials"));
    parts.push(`
      <table cellpadding="0" cellspacing="0" width="100%" style="background:${TINT};border-radius:6px;">
        <tr><td style="padding:14px 16px;">
          <table cellpadding="0" cellspacing="0" width="100%"><tr>
            ${[
              ["Budget", money(project.estBudget)],
              ["Committed", money(project.committed)],
              ["Spent", money(project.actualSpend)],
              ["Remaining", money(remaining)],
            ]
              .map(
                ([l, v]) => `<td style="width:25%;">
                  <p style="margin:0;font-size:9px;font-weight:700;letter-spacing:1px;color:${GREEN_DARK};text-transform:uppercase;">${l}</p>
                  <p style="margin:2px 0 0;font-size:15px;font-weight:800;color:${l === "Remaining" && remaining < 0 ? RED : INK};">${v}</p>
                </td>`
              )
              .join("")}
          </tr></table>
        </td></tr>
      </table>`);
  }

  if (parts.length === 0) return null;

  return { html: parts.join(""), projectTitle: project.title };
}

/**
 * Runs the whole weekly digest. Groups every enabled subscription by person so
 * each one gets a single email covering all their projects, rather than one
 * email per project.
 */
export async function sendWeeklyReports(appUrl: string): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const subs = await prisma.reportSubscription.findMany({
    where: { enabled: true },
    include: {
      member: { select: { id: true, name: true, email: true, role: true } },
      project: { select: { id: true, title: true } },
    },
  });

  const byMember = new Map<string, typeof subs>();
  for (const s of subs) {
    if (!s.member.email) continue;
    const list = byMember.get(s.member.id) || [];
    list.push(s);
    byMember.set(s.member.id, list);
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [memberId, list] of Array.from(byMember.entries())) {
    const member = list[0].member;
    const blocks: string[] = [];

    for (const sub of list) {
      // Re-check financial permission at send time rather than trusting the
      // subscription — permissions may have changed since it was created.
      let canSeeFin = member.role === "ADMIN";
      if (!canSeeFin) {
        const access = await prisma.projectAccess.findUnique({
          where: { projectId_memberId: { projectId: sub.projectId, memberId } },
        });
        canSeeFin = !!(access?.canView && access.canViewFinancials);
      }

      const report = await buildProjectReportHtml(sub.projectId, sub, canSeeFin);
      if (!report) continue;

      blocks.push(`
        <div style="margin-bottom:28px;padding-bottom:20px;border-bottom:2px solid ${LINE};">
          <h2 style="margin:0 0 2px;font-size:17px;font-weight:800;color:${INK};">${escapeHtml(report.projectTitle)}</h2>
          ${report.html}
        </div>`);
    }

    if (blocks.length === 0) {
      skipped++;
      continue;
    }

    const html = emailShell({
      kicker: "Weekly report",
      heading: `Your Z1Power weekly update`,
      body: `<p style="margin:0 0 18px;font-size:14px;color:${INK_SOFT};line-height:1.5;">Hi ${escapeHtml(
        member.name
      )}, here's where your projects stand this week.</p>${blocks.join("")}`,
      ctaText: "Open Team Hub",
      ctaUrl: appUrl,
    });

    const res = await sendEmail({
      to: member.email!,
      subject: `Z1Power weekly update — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      html,
    });

    if (res.ok) {
      sent++;
      await prisma.reportSubscription.updateMany({
        where: { memberId, enabled: true },
        data: { lastSentAt: new Date() },
      });
    } else {
      errors.push(`${member.email}: ${res.error}`);
    }
  }

  return { sent, skipped, errors };
}
