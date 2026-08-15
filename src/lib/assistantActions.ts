"use server";

/**
 * Server action behind the assistant widget.
 *
 * The permission model is rebuilt from the session on EVERY call — the client
 * cannot pass in an identity, a scope, or a context. It sends questions and
 * receives answers, nothing more. If someone's access changes, the very next
 * message reflects it.
 */

import { redirect } from "next/navigation";
import { getCurrentMember } from "./auth";
import { askAssistant, isChatConfigured, type ChatTurn } from "./ai/assistant";

export async function askAssistantAction(turns: ChatTurn[]): Promise<string> {
  const me = await getCurrentMember();
  if (!me) redirect("/login");

  if (!isChatConfigured()) {
    throw new Error("The assistant isn't configured — DEEPSEEK_API_KEY isn't set in Vercel.");
  }

  // Bound what the client can send. Without this, a crafted request could push
  // an arbitrarily large payload into the model call.
  const safe: ChatTurn[] = (Array.isArray(turns) ? turns : [])
    .filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
    .slice(-10)
    .map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }));

  if (safe.length === 0) throw new Error("Ask a question first.");

  // askAssistant takes prior turns and the new question separately.
  const question = safe[safe.length - 1];
  if (question.role !== "user") throw new Error("Ask a question first.");
  const history = safe.slice(0, -1);

  const res = await askAssistant(me!, history, question.content);
  if (!res.ok || !res.answer) {
    throw new Error(res.error ?? "The assistant couldn't answer that.");
  }
  return res.answer;
}

export async function assistantStatus() {
  const me = await getCurrentMember();
  if (!me) redirect("/login");
  return { configured: isChatConfigured(), isAdmin: me!.role === "ADMIN", name: me!.name };
}
