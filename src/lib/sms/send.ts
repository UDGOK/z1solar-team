import { prisma } from "@/lib/prisma";
import { normalizePhone } from "./twilio";

/**
 * Hard daily cap on outbound messages. A bug that loops — or a status change
 * that fires repeatedly — would otherwise run up a real bill silently. This is
 * a circuit breaker, not a business rule.
 */
const DAILY_SEND_CAP = 500;

export type SendResult = { ok: boolean; sid?: string; skipped?: string; error?: string };

/**
 * Sends one SMS. Never throws — a failed notification must not break the
 * action that triggered it (assigning a task, changing a status).
 */
export async function sendSms(opts: {
  to: string;
  body: string;
  projectId?: string | null;
  memberId?: string | null;
  contactId?: string | null;
}): Promise<SendResult> {
  try {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;
    if (!sid || !token || !from) return { ok: false, skipped: "Twilio isn't configured yet." };

    const to = normalizePhone(opts.to);
    if (!to) return { ok: false, skipped: "No valid phone number." };

    // --- Opt-out is legally binding in the US. Check before anything else. ---
    if (opts.memberId) {
      const m = await prisma.teamMember.findUnique({
        where: { id: opts.memberId },
        select: { smsOptedOut: true, smsEnabled: true },
      });
      if (m?.smsOptedOut) return { ok: false, skipped: "Recipient opted out of SMS." };
      if (m && !m.smsEnabled) return { ok: false, skipped: "SMS disabled for this member." };
    }
    const contact = await prisma.smsContact.findUnique({ where: { phone: to } });
    if (contact?.optedOut) return { ok: false, skipped: "Contact opted out of SMS." };
    if (contact && !contact.active) return { ok: false, skipped: "Contact is inactive." };

    // --- Cost circuit breaker ---
    const since = new Date(Date.now() - 24 * 3600_000);
    const sentToday = await prisma.smsMessage.count({
      where: { direction: "OUT", createdAt: { gte: since } },
    });
    if (sentToday >= DAILY_SEND_CAP) {
      console.error("[sms] daily send cap reached — refusing to send");
      return { ok: false, skipped: "Daily SMS limit reached." };
    }

    const params = new URLSearchParams({ To: to, From: from, Body: opts.body.slice(0, 1500) });

    // Ask Twilio to report final delivery. Without this a message that Twilio
    // accepts and then fails to deliver stays "queued" forever, which looks
    // like success — the exact failure this is meant to surface.
    const base = process.env.TWILIO_WEBHOOK_URL?.replace(/\/api\/sms\/webhook\/?$/, "");
    if (base) params.set("StatusCallback", `${base}/api/sms/status`);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      await logMessage({ ...opts, to, from, status: "failed", errorText: data?.message ?? `HTTP ${res.status}` });
      return { ok: false, error: data?.message ?? `Twilio returned ${res.status}` };
    }

    await logMessage({ ...opts, to, from, status: data.status ?? "queued", twilioSid: data.sid });
    return { ok: true, sid: data.sid };
  } catch (e: any) {
    console.error("[sms] send failed:", e);
    return { ok: false, error: e?.message ?? "Unknown error" };
  }
}

async function logMessage(o: {
  to: string;
  from: string;
  body: string;
  status: string;
  twilioSid?: string;
  errorText?: string;
  projectId?: string | null;
  memberId?: string | null;
  contactId?: string | null;
}) {
  try {
    await prisma.smsMessage.create({
      data: {
        twilioSid: o.twilioSid ?? null,
        direction: "OUT",
        fromNumber: o.from,
        toNumber: o.to,
        body: o.body,
        status: o.status,
        errorText: o.errorText ?? null,
        projectId: o.projectId ?? null,
        memberId: o.memberId ?? null,
        contactId: o.contactId ?? null,
        routedBy: "outbound",
      },
    });
  } catch (e) {
    console.error("[sms] failed to log outbound message:", e);
  }
}

/** Fire-and-forget notification helper used by task/alert actions. */
export async function notifyBySms(memberId: string, body: string, projectId?: string | null) {
  try {
    const m = await prisma.teamMember.findUnique({
      where: { id: memberId },
      select: { phone: true, smsEnabled: true, smsOptedOut: true },
    });
    if (!m?.phone || !m.smsEnabled || m.smsOptedOut) return;
    await sendSms({ to: m.phone, body, memberId, projectId });
  } catch (e) {
    console.error("[sms] notify failed:", e);
  }
}
