import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import ComposeMessage from "@/components/ComposeMessage";
import MessageCard, { type MessageItem } from "@/components/MessageCard";

import { PAGE_CONTAINER } from "@/lib/layout";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const me = await requirePageAuth();
  const isAdmin = me.role === "ADMIN";

  const [received, sent, teamMembers] = await Promise.all([
    prisma.messageRecipient.findMany({
      where: { memberId: me.id, deleted: false, message: { parentId: null } },
      include: {
        message: {
          include: {
            sender: { select: { id: true, name: true } },
            recipients: { select: { id: true } },
            replies: {
              include: { sender: { select: { name: true } } },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
      orderBy: { message: { createdAt: "desc" } },
      take: 100,
    }),
    prisma.message.findMany({
      where: { senderId: me.id, parentId: null },
      include: {
        sender: { select: { id: true, name: true } },
        recipients: { select: { id: true } },
        replies: { include: { sender: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.teamMember.findMany({
      where: { id: { not: me.id } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const inbox: MessageItem[] = received.map((r) => ({
    id: r.message.id,
    subject: r.message.subject,
    body: r.message.body,
    kind: r.message.kind,
    priority: r.message.priority,
    senderName: r.message.sender?.name || "Z1Power",
    senderId: r.message.senderId,
    createdAt: r.message.createdAt.toISOString(),
    read: r.read,
    acknowledged: r.acknowledged,
    isMine: false,
    recipientCount: r.message.recipients.length,
    replies: r.message.replies.map((x) => ({
      id: x.id,
      body: x.body,
      senderName: x.sender?.name || "—",
      createdAt: x.createdAt.toISOString(),
    })),
  }));

  const outbox: MessageItem[] = sent.map((m) => ({
    id: m.id,
    subject: m.subject,
    body: m.body,
    kind: m.kind,
    priority: m.priority,
    senderName: "You",
    senderId: m.senderId,
    createdAt: m.createdAt.toISOString(),
    read: true,
    acknowledged: true,
    isMine: true,
    recipientCount: m.recipients.length,
    replies: m.replies.map((x) => ({
      id: x.id,
      body: x.body,
      senderName: x.sender?.name || "—",
      createdAt: x.createdAt.toISOString(),
    })),
  }));

  const unread = inbox.filter((m) => !m.read).length;

  return (
    <AppShell active="/messages">
      <main className={`${PAGE_CONTAINER} space-y-6`}>
        <div>
          <p className="kicker mb-1">[ Z1POWER ]</p>
          <h1 className="font-heading text-3xl font-extrabold text-brand-ink">Messages</h1>
          <p className="text-sm text-brand-inkSoft mt-1">
            {inbox.length} received{unread > 0 && <span className="text-brand-green font-semibold"> · {unread} unread</span>} ·{" "}
            {outbox.length} sent
          </p>
        </div>

        <ComposeMessage teamMembers={teamMembers} isAdmin={isAdmin} />

        <section>
          <p className="kicker mb-3">Inbox</p>
          <div className="space-y-2">
            {inbox.map((m) => (
              <MessageCard key={m.id} m={m} canDeleteForAll={isAdmin} />
            ))}
            {inbox.length === 0 && (
              <div className="card p-8 text-center bg-white">
                <p className="text-sm text-brand-inkSoft">No messages yet.</p>
              </div>
            )}
          </div>
        </section>

        {outbox.length > 0 && (
          <section>
            <p className="kicker mb-3">Sent</p>
            <div className="space-y-2">
              {outbox.map((m) => (
                <MessageCard key={m.id} m={m} canDeleteForAll={isAdmin} />
              ))}
            </div>
          </section>
        )}
      </main>
    </AppShell>
  );
}
