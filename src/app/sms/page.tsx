import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGlobalCapabilities, getViewableProjectIds } from "@/lib/permissions";
import { PAGE_CONTAINER } from "@/lib/layout";
import AppShell from "@/components/AppShell";
import SmsHub, { type SmsMsg, type SmsContactItem } from "@/components/SmsHub";

export const dynamic = "force-dynamic";

export default async function SmsPage() {
  const me = await requirePageAuth();
  const isAdmin = me.role === "ADMIN";
  const caps = await getGlobalCapabilities(me);
  if (!isAdmin && !caps.canViewSms) notFound();

  const viewableIds = await getViewableProjectIds(me);

  const [msgs, contacts, projects] = await Promise.all([
    prisma.smsMessage.findMany({
      // Only messages for projects this person can see, plus unfiled ones
      // (which need triage and reveal nothing about a project they can't view).
      where: { OR: [{ projectId: { in: viewableIds } }, { projectId: null }] },
      include: {
        project: { select: { title: true } },
        member: { select: { name: true } },
        contact: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.smsContact.findMany({ orderBy: { name: "asc" } }),
    prisma.project.findMany({
      where: { archived: false, id: { in: viewableIds } },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
  ]);

  const messages: SmsMsg[] = msgs.map((m) => ({
    id: m.id,
    direction: m.direction,
    fromNumber: m.fromNumber,
    toNumber: m.toNumber,
    body: m.body,
    status: m.status,
    routedBy: m.routedBy,
    mediaCount: m.mediaCount,
    handled: m.handled,
    projectId: m.projectId,
    projectTitle: m.project?.title ?? null,
    senderName: m.member?.name ?? m.contact?.name ?? null,
    createdAt: m.createdAt.toISOString(),
  }));

  const contactItems: SmsContactItem[] = contacts.map((c) => ({
    id: c.id,
    phone: c.phone,
    name: c.name,
    company: c.company,
    active: c.active,
    optedOut: c.optedOut,
    projectCount: c.projectIds ? c.projectIds.split(",").filter(Boolean).length : 0,
  }));

  const configured = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);

  return (
    <AppShell active="/sms">
      <main className={PAGE_CONTAINER}>
        <div className="mb-5">
          <p className="text-[8.5px] font-semibold tracking-[0.14em] text-brand-green">[ Z1POWER ]</p>
          <h1 className="font-heading font-extrabold text-[20px] sm:text-[22px] text-brand-ink tracking-tight mt-0.5">Text Messages</h1>
          <p className="text-[11px] text-brand-inkSoft mt-0.5">
            Field texts filed against projects. Only approved numbers can message in.
          </p>
        </div>
        <SmsHub
          messages={messages}
          contacts={contactItems}
          projects={projects}
          canSend={isAdmin || caps.canSendSms}
          canManageContacts={isAdmin || caps.canManageSmsContacts}
          configured={configured}
        />
      </main>
    </AppShell>
  );
}
