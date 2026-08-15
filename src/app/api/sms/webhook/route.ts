import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTwilioSignature, normalizePhone } from "@/lib/sms/twilio";
import { identifySender, routeMessage, openSession, setPending } from "@/lib/sms/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Twilio expects TwiML. An empty response means "received, say nothing back". */
function twiml(message?: string) {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new NextResponse(body, { status: 200, headers: { "Content-Type": "text/xml" } });
}

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

export async function POST(request: Request) {
  const raw = await request.text();
  const params: Record<string, string> = {};
  new URLSearchParams(raw).forEach((v, k) => (params[k] = v));

  // ---- 0. Prove it's actually Twilio -------------------------------------
  // Without this the webhook is a public write endpoint into the CMS.
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const configuredUrl = process.env.TWILIO_WEBHOOK_URL; // must match Twilio's console exactly
  const url = configuredUrl || request.url;
  const valid = verifyTwilioSignature({
    authToken: authToken ?? "",
    signature: request.headers.get("x-twilio-signature"),
    url,
    params,
  });
  if (!valid) {
    console.error("[sms webhook] signature verification FAILED — rejecting");
    return new NextResponse("Forbidden", { status: 403 });
  }

  const messageSid = params.MessageSid || params.SmsMessageSid;
  const from = normalizePhone(params.From);
  const to = params.To ?? "";
  const body = (params.Body ?? "").trim();
  const numMedia = Number(params.NumMedia ?? 0);

  if (!from || !messageSid) return twiml();

  // ---- 1. Idempotency ----------------------------------------------------
  // Twilio retries anything it thinks failed; without this the same field note
  // gets filed twice.
  const seen = await prisma.smsMessage.findUnique({ where: { twilioSid: messageSid } });
  if (seen) return twiml();

  // ---- 2. Allowlist ------------------------------------------------------
  const sender = await identifySender(from);
  if (sender.kind === "unknown") {
    // Deliberately terse and non-committal — don't confirm to a stranger that
    // this number belongs to anything in particular.
    console.warn("[sms webhook] rejected message from unapproved number");
    return twiml("This number isn't set up to receive messages here.");
  }

  // ---- 3. Legally-required keywords -------------------------------------
  const upper = body.toUpperCase();
  if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(upper)) {
    if (sender.kind === "member") {
      await prisma.teamMember.update({ where: { id: sender.id }, data: { smsOptedOut: true } });
    } else if (sender.kind === "contact") {
      await prisma.smsContact.update({ where: { id: sender.id }, data: { optedOut: true } });
    }
    // Twilio's own STOP handling also replies; we stay silent to avoid double.
    return twiml();
  }
  if (["START", "UNSTOP", "YES"].includes(upper)) {
    if (sender.kind === "member") {
      await prisma.teamMember.update({ where: { id: sender.id }, data: { smsOptedOut: false } });
    } else if (sender.kind === "contact") {
      await prisma.smsContact.update({ where: { id: sender.id }, data: { optedOut: false } });
    }
    return twiml("You're subscribed again. Text HELP for commands.");
  }
  if (upper === "HELP" || upper === "INFO") {
    return twiml(
      "Z1Power. Commands:\n" +
        "MEAD: your note — file against a project\n" +
        "TASKS — your open tasks\n" +
        "DONE — complete your last task\n" +
        "Send a photo to attach it to the current project.\n" +
        "STOP to opt out."
    );
  }

  if (sender.optedOut) return twiml();

  // ---- 4. Which projects may this sender write to? ----------------------
  let visibleIds: string[];
  if (sender.kind === "member") {
    const { getViewableProjectIds } = await import("@/lib/permissions");
    const rec = await prisma.teamMember.findUnique({ where: { id: sender.id } });
    visibleIds = await getViewableProjectIds({
      id: sender.id,
      name: sender.name,
      email: rec?.email ?? "",
      role: (rec?.role as any) ?? "MEMBER",
    });
  } else {
    // External contacts are scoped to whatever they were granted, and nothing
    // more — a vendor shouldn't be able to file notes across the portfolio.
    if (sender.allowedProjectIds && sender.allowedProjectIds.length) {
      visibleIds = sender.allowedProjectIds;
    } else {
      const all = await prisma.project.findMany({ where: { archived: false }, select: { id: true } });
      visibleIds = all.map((p) => p.id);
    }
  }

  // ---- 5. TASKS / DONE ---------------------------------------------------
  if (sender.kind === "member" && (upper === "TASKS" || upper === "DONE")) {
    return twiml(await handleTaskCommand(upper, sender.id, from));
  }

  // ---- 6. Route to a project --------------------------------------------
  const routed = await routeMessage(from, body, visibleIds);

  if (!routed.projectId && routed.askChoices?.length) {
    await setPending(from, routed.askChoices.map((c) => c.id), body);
    const list = routed.askChoices.map((c, i) => `${i + 1}-${c.title}`).join("\n");
    await recordMessage({ messageSid, from, to, body, numMedia, sender, projectId: null, routedBy: "none", handled: false });
    return twiml(`Which project?\n${list}\n\nReply with a number, or text like "MEAD: your note".`);
  }

  if (routed.projectId) await openSession(from, routed.projectId);

  const saved = await recordMessage({
    messageSid,
    from,
    to,
    body: routed.cleanBody || body,
    numMedia,
    sender,
    projectId: routed.projectId,
    routedBy: routed.routedBy,
    handled: true,
  });

  // ---- 7. Media -> project files ----------------------------------------
  if (numMedia > 0 && routed.projectId) {
    // Deliberately not awaited: Twilio retries if we take too long, and a slow
    // image download would cause duplicate deliveries.
    void storeMedia(params, numMedia, routed.projectId, sender).catch((e) =>
      console.error("[sms webhook] media store failed:", e)
    );
  }

  const project = routed.projectId
    ? await prisma.project.findUnique({ where: { id: routed.projectId }, select: { title: true } })
    : null;

  if (project) {
    const { logActivity } = await import("@/lib/activity");
    await logActivity({
      projectId: routed.projectId!,
      // External contacts have no TeamMember row, so pass a synthetic actor —
      // the activity log denormalises the name and keeps working.
      actor: { id: sender.kind === "member" ? sender.id : "sms-contact", name: sender.name },
      action: "task.created",
      summary: `SMS from ${sender.name}: ${(routed.cleanBody || body).slice(0, 100)}`,
      meta: { smsId: saved?.id, routedBy: routed.routedBy },
    });
  }

  // Confirm only when we inferred the project, so people know where it landed.
  if (project && routed.routedBy !== "session") {
    return twiml(`Filed to ${project.title}${numMedia > 0 ? ` (${numMedia} photo${numMedia === 1 ? "" : "s"})` : ""}.`);
  }
  return twiml();
}

async function recordMessage(o: {
  messageSid: string;
  from: string;
  to: string;
  body: string;
  numMedia: number;
  sender: any;
  projectId: string | null;
  routedBy: string;
  handled: boolean;
}) {
  try {
    return await prisma.smsMessage.create({
      data: {
        twilioSid: o.messageSid,
        direction: "IN",
        fromNumber: o.from,
        toNumber: o.to,
        body: o.body,
        status: "received",
        projectId: o.projectId,
        memberId: o.sender.kind === "member" ? o.sender.id : null,
        contactId: o.sender.kind === "contact" ? o.sender.id : null,
        routedBy: o.routedBy,
        mediaCount: o.numMedia,
        handled: o.handled,
      },
    });
  } catch (e) {
    console.error("[sms webhook] failed to record message:", e);
    return null;
  }
}

/** Downloads MMS from Twilio into private blob storage, then deletes it there. */
async function storeMedia(params: Record<string, string>, count: number, projectId: string, sender: any) {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const auth = `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
  const { put } = await import("@vercel/blob");

  for (let i = 0; i < count; i++) {
    const url = params[`MediaUrl${i}`];
    const type = params[`MediaContentType${i}`] || "image/jpeg";
    if (!url) continue;

    const res = await fetch(url, { headers: { Authorization: auth } });
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());

    const ext = type.split("/")[1]?.split("+")[0] || "jpg";
    const name = `sms-${new Date().toISOString().slice(0, 10)}-${Date.now()}-${i}.${ext}`;
    const blob = await put(`projects/${projectId}/${name}`, buf, {
      access: "private",
      addRandomSuffix: true,
      contentType: type,
    });

    await prisma.projectFile.create({
      data: {
        projectId,
        url: "",
        pathname: blob.pathname,
        filename: name,
        contentType: type,
        size: buf.length,
      },
    });

    // Twilio media URLs are reachable by anyone with the link until deleted —
    // remove them once we have our own private copy.
    await fetch(url, { method: "DELETE", headers: { Authorization: auth } }).catch(() => {});
  }
}

async function handleTaskCommand(cmd: string, memberId: string, phone: string): Promise<string> {
  const { rememberTask } = await import("@/lib/sms/router");

  if (cmd === "TASKS") {
    const todos = await prisma.todo.findMany({
      where: { done: false, assignees: { some: { memberId } } },
      include: { project: { select: { title: true } } },
      orderBy: [{ dueDate: "asc" }],
      take: 5,
    });
    if (!todos.length) return "You have no open tasks.";
    await rememberTask(phone, todos[0].id);
    return (
      `Your open tasks:\n` +
      todos
        .map((t, i) => `${i + 1}. ${t.text} (${t.project.title})${t.dueDate ? ` — due ${t.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}`)
        .join("\n") +
      `\n\nText DONE to complete #1.`
    );
  }

  // DONE — completes the task we last told them about.
  const session = await prisma.smsSession.findUnique({ where: { phone } });
  let taskId = session?.lastTaskId ?? null;
  if (!taskId) {
    const next = await prisma.todo.findFirst({
      where: { done: false, assignees: { some: { memberId } } },
      orderBy: [{ dueDate: "asc" }],
    });
    taskId = next?.id ?? null;
  }
  if (!taskId) return "You have no open tasks to complete.";

  const todo = await prisma.todo.findUnique({
    where: { id: taskId },
    include: { project: { select: { title: true } }, assignees: true },
  });
  if (!todo) return "Couldn't find that task.";
  if (!todo.assignees.some((a) => a.memberId === memberId)) return "That task isn't assigned to you.";

  await prisma.todo.update({ where: { id: taskId }, data: { done: true } });
  await prisma.smsSession.update({ where: { phone }, data: { lastTaskId: null } }).catch(() => {});
  return `Done: ${todo.text} (${todo.project.title})`;
}
