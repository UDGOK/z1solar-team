import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTwilioSignature } from "@/lib/sms/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Twilio delivery status callback.
 *
 * Sending returns "queued" — that only means Twilio accepted the message, not
 * that it arrived. Final states (delivered / undelivered / failed) arrive here
 * asynchronously. Without this, a message that silently fails at the carrier
 * looks identical to one that worked.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const params: Record<string, string> = {};
  new URLSearchParams(raw).forEach((v, k) => (params[k] = v));

  const base = process.env.TWILIO_WEBHOOK_URL?.replace(/\/api\/sms\/webhook\/?$/, "");
  const valid = verifyTwilioSignature({
    authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
    signature: request.headers.get("x-twilio-signature"),
    url: base ? `${base}/api/sms/status` : request.url,
    params,
  });
  if (!valid) {
    console.error("[sms status] signature verification failed");
    return new NextResponse("Forbidden", { status: 403 });
  }

  const sid = params.MessageSid || params.SmsSid;
  const status = params.MessageStatus || params.SmsStatus;
  if (!sid || !status) return NextResponse.json({ ok: true });

  // Twilio sends a numeric code on failure; it's the single most useful thing
  // for diagnosing why a message didn't land.
  const code = params.ErrorCode;
  const errorText = code ? `Twilio error ${code}${params.ErrorMessage ? `: ${params.ErrorMessage}` : ""}` : null;

  try {
    await prisma.smsMessage.updateMany({
      where: { twilioSid: sid },
      data: { status, ...(errorText ? { errorText } : {}) },
    });
    if (["failed", "undelivered"].includes(status)) {
      console.error(`[sms status] ${sid} ${status}${errorText ? ` — ${errorText}` : ""}`);
    }
  } catch (e) {
    console.error("[sms status] failed to update:", e);
  }

  return NextResponse.json({ ok: true });
}
