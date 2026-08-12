import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import Navbar from "@/components/Navbar";
import AddMemberForm from "@/components/AddMemberForm";
import TeamMemberRow from "@/components/TeamMemberRow";
import WhatsAppLinkForm from "@/components/WhatsAppLinkForm";
import TeamPresence, { PresenceDot } from "@/components/TeamPresence";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const member = await requirePageAuth();
  const isAdmin = member.role === "ADMIN";
  const [members, settings] = await Promise.all([
    prisma.teamMember.findMany({ orderBy: { name: "asc" } }),
    getSettings(),
  ]);

  return (
    <div className="min-h-screen bg-brand-greenTint">
      <Navbar active="/team" />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div>
          <p className="kicker mb-1">[ Z1POWER ]</p>
          <h1 className="font-heading text-3xl font-extrabold text-brand-ink">Team Directory</h1>
          <p className="text-xs text-brand-inkFaint mt-1">
            Each person's email here is exactly what they sign in with via Google.
          </p>
        </div>

        <div className="bg-white border border-brand-line rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-ink text-white text-left">
                <th className="px-4 py-3 font-mono text-xs tracking-widest">NAME</th>
                <th className="px-4 py-3 font-mono text-xs tracking-widest">TITLE</th>
                <th className="px-4 py-3 font-mono text-xs tracking-widest">EMAIL</th>
                <th className="px-4 py-3 font-mono text-xs tracking-widest">PHONE</th>
                <th className="px-4 py-3 font-mono text-xs tracking-widest">LAST SEEN</th>
                {isAdmin && <th className="px-4 py-3 font-mono text-xs tracking-widest"></th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => (
                <TeamMemberRow key={m.id} member={m} zebra={i % 2 === 1} editable={isAdmin} />
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-4 py-10 text-center text-brand-inkFaint">
                    No team members yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {isAdmin && <AddMemberForm />}

        {isAdmin && (
          <TeamPresence
            members={members.map((m) => ({
              id: m.id,
              name: m.name,
              title: m.title,
              role: m.role,
              lastSeenAt: m.lastSeenAt,
            }))}
          />
        )}

        <WhatsAppLinkForm initialLink={settings.whatsappLink} />
      </main>
    </div>
  );
}
