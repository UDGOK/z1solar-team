import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PAGE_CONTAINER } from "@/lib/layout";
import AppShell from "@/components/AppShell";
import AssistantChat, { type Thread } from "@/components/AssistantChat";
import { isChatConfigured } from "@/lib/ai/assistant";

export const dynamic = "force-dynamic";

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const me = await requirePageAuth();

  const threads = await prisma.chatThread.findMany({
    where: { memberId: me.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  const mapped: Thread[] = threads.map((th) => ({
    id: th.id,
    title: th.title,
    updatedAt: th.updatedAt.toISOString(),
    messages: th.messages.map((m) => ({
      id: m.id, role: m.role, content: m.content, createdAt: m.createdAt.toISOString(),
    })),
  }));

  const active = t ? mapped.find((x) => x.id === t) ?? null : null;

  return (
    <AppShell active="/assistant">
      <main className={PAGE_CONTAINER}>
        <div className="mb-5">
          <p className="text-[8.5px] font-semibold tracking-[0.14em] text-brand-green">[ Z1POWER ]</p>
          <h1 className="font-heading font-extrabold text-[20px] sm:text-[22px] text-brand-ink tracking-tight mt-0.5">Assistant</h1>
          <p className="text-[11px] text-brand-inkSoft mt-0.5">
            Ask about projects, budgets, tasks and meetings — or anything else.
          </p>
        </div>
        <AssistantChat threads={mapped} activeThread={active} memberName={me.name} configured={isChatConfigured()} />
      </main>
    </AppShell>
  );
}
