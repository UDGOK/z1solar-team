import { requirePageAuth } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import WhatsAppLinkForm from "@/components/WhatsAppLinkForm";
import MeetingLinkForm from "@/components/MeetingLinkForm";
import AdminManagement from "@/components/AdminManagement";
import InviteManager from "@/components/InviteManager";
import ChangeOwnPasswordForm from "@/components/ChangeOwnPasswordForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const member = await requirePageAuth();
  const isAdmin = member.role === "ADMIN";
  const settings = await getSettings();

  const me = await prisma.teamMember.findUnique({
    where: { id: member.id },
    select: { passwordHash: true },
  });

  const allMembers = isAdmin
    ? await prisma.teamMember.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true, role: true, passwordHash: true },
      })
    : [];

  return (
    <div className="min-h-screen bg-brand-greenTint">
      <Navbar active="/settings" />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div>
          <p className="kicker mb-1">[ Z1POWER ]</p>
          <h1 className="font-heading text-3xl font-extrabold text-brand-ink">Settings</h1>
        </div>

        {isAdmin && (
          <>
            <MeetingLinkForm initialLink={settings.meetingLink} />
            <WhatsAppLinkForm initialLink={settings.whatsappLink} />
            <AdminManagement
              members={allMembers.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role }))}
              currentMemberId={member.id}
            />
            <InviteManager
              members={allMembers.map((m) => ({
                id: m.id,
                name: m.name,
                email: m.email,
                hasPassword: !!m.passwordHash,
              }))}
            />
          </>
        )}

        <ChangeOwnPasswordForm hasPassword={!!me?.passwordHash} />
      </main>
    </div>
  );
}
