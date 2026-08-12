import { requirePageAuth } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import WhatsAppLinkForm from "@/components/WhatsAppLinkForm";
import MeetingLinkForm from "@/components/MeetingLinkForm";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import ChangeAdminPasswordForm from "@/components/ChangeAdminPasswordForm";
import AdminManagement from "@/components/AdminManagement";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requirePageAuth();
  const isAdmin = session.role === "ADMIN";
  const settings = await getSettings();
  const members = isAdmin
    ? await prisma.teamMember.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true, role: true } })
    : [];

  return (
    <div className="min-h-screen bg-brand-greenTint">
      <Navbar active="/settings" />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div>
          <p className="kicker mb-1">[ Z1POWER ]</p>
          <h1 className="font-heading text-3xl font-extrabold text-brand-ink">Settings</h1>
        </div>

        <MeetingLinkForm initialLink={settings.meetingLink} />
        <WhatsAppLinkForm initialLink={settings.whatsappLink} />

        {isAdmin ? (
          <>
            <AdminManagement members={members} currentAdminId={session.adminId} />
            <ChangeAdminPasswordForm />
          </>
        ) : null}

        <ChangePasswordForm />
      </main>
    </div>
  );
}
