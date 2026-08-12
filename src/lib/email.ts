import { Resend } from "resend";

const FROM = process.env.RESEND_FROM || "Z1Power Team Hub <onboarding@resend.dev>";

function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

/**
 * Sends an email, but never throws — a failed notification must not break the
 * action that triggered it (e.g. assigning a task should still succeed even if
 * the mail server is down). Failures are logged and reported in the return value.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const resend = client();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping send to", opts.to);
    return { ok: false, error: "Email is not configured (RESEND_API_KEY missing)." };
  }
  try {
    const res = await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    if ((res as any)?.error) {
      const msg = (res as any).error?.message || "Unknown Resend error";
      console.error("[email] send failed:", msg);
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (e: any) {
    console.error("[email] send threw:", e?.message);
    return { ok: false, error: e?.message || "Send failed." };
  }
}

// ---------- Branded HTML shell ----------

const GREEN = "#4CAB3E";
const GREEN_DARK = "#3F9634";
const INK = "#1C1C1C";
const INK_SOFT = "#3A3A3A";
const INK_FAINT = "#8A8A85";
const LINE = "#D8D8D2";
const TINT = "#F5F9F3";

export function emailShell(opts: { heading: string; kicker?: string; body: string; ctaText?: string; ctaUrl?: string }) {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:${TINT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${TINT};padding:24px 12px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#fff;border:1px solid ${LINE};border-radius:8px;overflow:hidden;">
        <tr><td style="padding:20px 24px;border-bottom:3px solid ${GREEN};">
          <span style="font-size:18px;font-weight:800;color:${INK};letter-spacing:-0.3px;">Z1POWER</span>
          <span style="font-size:11px;color:${GREEN_DARK};font-weight:700;letter-spacing:1px;"> // TEAM HUB</span>
        </td></tr>
        <tr><td style="padding:24px;">
          ${opts.kicker ? `<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1.5px;color:${GREEN_DARK};text-transform:uppercase;">${opts.kicker}</p>` : ""}
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:${INK};line-height:1.25;">${opts.heading}</h1>
          ${opts.body}
          ${
            opts.ctaUrl
              ? `<table cellpadding="0" cellspacing="0" style="margin:24px 0 4px;"><tr><td style="background:${GREEN};border-radius:6px;">
                  <a href="${opts.ctaUrl}" style="display:inline-block;padding:11px 22px;color:#fff;font-size:14px;font-weight:600;text-decoration:none;">${opts.ctaText || "Open"}</a>
                </td></tr></table>`
              : ""
          }
        </td></tr>
        <tr><td style="padding:14px 24px;border-top:1px solid ${LINE};">
          <p style="margin:0;font-size:11px;color:${INK_FAINT};">Confidential — Z1Power internal. You're receiving this because you're on the Z1Power team.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function taskAssignedEmail(opts: {
  assigneeName: string;
  assignerName: string;
  taskText: string;
  projectTitle: string;
  dueDate?: Date | null;
  appUrl: string;
}) {
  const due = opts.dueDate
    ? `<p style="margin:0 0 4px;font-size:14px;color:${INK_SOFT};"><strong style="color:${INK};">Due:</strong> ${opts.dueDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>`
    : "";
  return emailShell({
    kicker: "New task assigned",
    heading: `${opts.assignerName} assigned you a task`,
    body: `
      <div style="background:${TINT};border-left:3px solid ${GREEN};padding:14px 16px;border-radius:4px;margin-bottom:16px;">
        <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:${INK};">${escapeHtml(opts.taskText)}</p>
        <p style="margin:0 0 4px;font-size:14px;color:${INK_SOFT};"><strong style="color:${INK};">Project:</strong> ${escapeHtml(opts.projectTitle)}</p>
        ${due}
      </div>
      <p style="margin:0;font-size:14px;color:${INK_SOFT};line-height:1.5;">Hi ${escapeHtml(opts.assigneeName)}, this task is now on your list.</p>`,
    ctaText: "View My Tasks",
    ctaUrl: `${opts.appUrl}/tasks`,
  });
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
