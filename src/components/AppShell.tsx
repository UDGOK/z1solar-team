import { prisma } from "@/lib/prisma";
import AssistantWidget from "./AssistantWidget";
import { isChatConfigured } from "@/lib/ai/assistant";
import { getCurrentMember } from "@/lib/auth";
import { getViewableProjectIds } from "@/lib/permissions";
import { categoryColor, sortCategories } from "@/lib/categories";
import SideNav from "./SideNav";

/**
 * Wraps every authenticated page: sidebar on desktop, drawer + bottom tabs on
 * mobile. Category counts and badges are computed here so each page doesn't
 * repeat the query.
 *
 * Bottom padding on mobile clears the fixed tab bar — without it the last card
 * on every page sits underneath it and can't be tapped.
 */
export default async function AppShell({
  active,
  children,
}: {
  active: string;
  children: React.ReactNode;
}) {
  const member = await getCurrentMember();

  let categories: { name: string; count: number; color: string }[] = [];
  let openTaskCount = 0;
  let unreadMessageCount = 0;

  if (member) {
    const viewableIds = await getViewableProjectIds(member);

    const [projects, tasks, unread] = await Promise.all([
      prisma.project.findMany({
        where: { id: { in: viewableIds }, archived: false },
        select: { category: true },
      }),
      prisma.todo.count({
        where: { done: false, assignees: { some: { memberId: member.id } } },
      }),
      prisma.messageRecipient.count({
        where: { memberId: member.id, read: false, deleted: false },
      }),
    ]);

    const counts = new Map<string, number>();
    for (const p of projects) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    categories = sortCategories(Array.from(counts.keys())).map((name) => ({
      name,
      count: counts.get(name) ?? 0,
      color: categoryColor(name),
    }));

    openTaskCount = tasks;
    unreadMessageCount = unread;
  }

  return (
    <div className="min-h-screen bg-brand-greenTint lg:flex">
      <SideNav
        active={active}
        categories={categories}
        memberName={member?.name ?? ""}
        isAdmin={member?.role === "ADMIN"}
        openTaskCount={openTaskCount}
        unreadMessageCount={unreadMessageCount}
      />
      {/* Not a <main> — each page renders its own, and nesting them is
          invalid HTML and breaks screen-reader landmark navigation. */}
      <div className="flex-1 min-w-0 pb-20 lg:pb-0">{children}</div>

      {/* Available on every page, scoped per person. See AssistantWidget.
          Only rendered when signed in — the login screen has no assistant. */}
      {member && (
        <AssistantWidget
          memberName={member.name}
          isAdmin={member.role === "ADMIN"}
          configured={isChatConfigured()}
        />
      )}
    </div>
  );
}
