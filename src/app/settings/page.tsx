import { requirePageAuth } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import WhatsAppLinkForm from "@/components/WhatsAppLinkForm";
import MeetingLinkForm from "@/components/MeetingLinkForm";
import AdminManagement from "@/components/AdminManagement";
import Link from "next/link";
import { getGlobalCapabilities } from "@/lib/permissions";
import InviteManager from "@/components/InviteManager";
import ChangeOwnPasswordForm from "@/components/ChangeOwnPasswordForm";

import { PAGE_CONTAINER } from "@/lib/layout";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const member = await requirePageAuth();
  const isAdmin = member.role === "ADMIN";
  const settings = await getSettings();
  const caps = await getGlobalCapabilities(member);

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
    <AppShell active="/settings">
      <main className={`${PAGE_CONTAINER} space-y-8`}>
        <div>
          <p className="kicker mb-1">[ Z1POWER ]</p>
          <h1 className="font-heading text-3xl font-extrabold text-brand-ink">Settings</h1>
        </div>

        {caps.canManageRoles && (
          <div className="card p-5 bg-white">
            <p className="kicker mb-2">Roles &amp; Permissions</p>
            <p className="text-xs text-brand-inkFaint mb-3">
              Create roles like Supervisor or Project Lead, choose what each can do, and assign them to your team.
            </p>
            <Link href="/settings/roles" className="btn-secondary text-xs">Manage Roles →</Link>
          </div>
        )}

        {(isAdmin || caps.canViewAuditLog) && (
          <div className="card p-5 bg-white">
            <p className="kicker mb-2">Audit &amp; Integrity</p>
            <p className="text-xs text-brand-inkFaint mb-3">
              Who changed what and when, financial reconciliation against line items, and restoring from a backup.
            </p>
            <Link href="/settings/audit" className="btn-secondary text-xs">Open audit log →</Link>
          </div>
        )}

        {caps.canManageCategories && (
          <div className="card p-5 bg-white">
            <p className="kicker mb-2">Project Categories</p>
            <p className="text-xs text-brand-inkFaint mb-3">
              Create, rename, recolour or remove the categories projects are grouped by.
            </p>
            <Link href="/settings/categories" className="btn-secondary text-xs">Manage Categories →</Link>
          </div>
        )}

        {isAdmin && (
          <>
            <MeetingLinkForm initialLink={settings.meetingLink} />
            <WhatsAppLinkForm initialLink={settings.whatsappLink} />
            <AdminManagement
              members={allMembers.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role }))}
              currentMemberId={member.id}
            />
            <div className="card p-5 bg-white">
              <p className="kicker mb-2">Backup</p>
              <p className="text-xs text-brand-inkFaint mb-3">
                Download a full JSON export of every project, task, financial line item, and team record.
                Passwords and invite tokens are excluded. Uploaded files are referenced by URL rather than embedded.
              </p>
              <a href="/api/backup" className="btn-secondary text-xs" download>
                ↓ Download Backup (JSON)
              </a>
            </div>

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
    </AppShell>
  );
}
