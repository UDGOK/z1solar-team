import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProjectPermissions } from "@/lib/permissions";
import { ALL_PERMISSIONS, type Permission } from "@/lib/permissionTypes";
import Navbar from "@/components/Navbar";
import ToggleCheckbox from "@/components/ToggleCheckbox";
import DeleteProjectButton from "@/components/DeleteProjectButton";
import ProjectFiles from "@/components/ProjectFiles";
import FileUploader from "@/components/FileUploader";
import CompletionRing from "@/components/CompletionRing";
import ShareSummary from "@/components/ShareSummary";
import ProjectAccessPanel from "@/components/ProjectAccessPanel";
import ReportSubscriptions from "@/components/ReportSubscriptions";
import ActivityFeed from "@/components/ActivityFeed";
import SiteDetailsForm from "@/components/SiteDetailsForm";
import RebatePanel from "@/components/RebatePanel";
import FinancialsDetail from "@/components/FinancialsDetail";
import FinancialsLocked from "@/components/FinancialsLocked";
import { toggleTodo, toggleQuestion } from "@/lib/actions";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const CAT_COLOR: Record<string, string> = {
  "Solar & Battery": "text-brand-green",
  "Other Projects": "text-brand-greenDark",
  "Other Matters": "text-brand-ink",
  "New Project": "text-brand-amber",
};

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const member = await requirePageAuth();
  const isAdmin = member.role === "ADMIN";
  const perms = await getProjectPermissions(member, params.id);

  // Default-deny: no view permission means this project doesn't exist as far
  // as this person is concerned.
  if (!perms.canView) notFound();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      lead: true,
      members: { include: { member: true } },
      talkingPoints: { orderBy: { order: "asc" } },
      keyDates: { orderBy: { order: "asc" } },
      todos: { orderBy: { order: "asc" }, include: { assignee: { select: { id: true, name: true } } } },
      questions: { orderBy: { order: "asc" } },
      files: { orderBy: { uploadedAt: "desc" } },
      rebates: { orderBy: { order: "asc" } },
    },
  });
  if (!project) notFound();

  const canEditAnything =
    perms.canEditTalkingPoints ||
    perms.canEditKeyDates ||
    perms.canEditTodos ||
    perms.canEditQuestions ||
    perms.canEditTeam ||
    perms.canEditFinancials ||
    perms.canEditStatus;

  const accessRows = isAdmin
    ? await (async () => {
        const [allMembers, existing] = await Promise.all([
          prisma.teamMember.findMany({
            where: { role: "MEMBER" },
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          }),
          prisma.projectAccess.findMany({ where: { projectId: project.id } }),
        ]);
        return allMembers.map((m) => {
          const row = existing.find((a) => a.memberId === m.id);
          const p = Object.fromEntries(
            ALL_PERMISSIONS.map((perm) => [perm.key, row ? (row as any)[perm.key] === true : false])
          ) as Record<Permission, boolean>;
          return { memberId: m.id, name: m.name, perms: p };
        });
      })()
    : [];

  const subRows = isAdmin
    ? await (async () => {
        const [people, subs, access] = await Promise.all([
          prisma.teamMember.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true, role: true } }),
          prisma.reportSubscription.findMany({ where: { projectId: project.id } }),
          prisma.projectAccess.findMany({ where: { projectId: project.id } }),
        ]);
        return people.map((p) => {
          const sub = subs.find((x) => x.memberId === p.id);
          const acc = access.find((x) => x.memberId === p.id);
          return {
            memberId: p.id,
            name: p.name,
            email: p.email,
            enabled: sub?.enabled ?? false,
            includeStatus: sub?.includeStatus ?? true,
            includeTasks: sub?.includeTasks ?? true,
            includeKeyDates: sub?.includeKeyDates ?? false,
            includeQuestions: sub?.includeQuestions ?? false,
            includeFinancials: sub?.includeFinancials ?? false,
            canSeeFinancials: p.role === "ADMIN" || !!(acc?.canView && acc.canViewFinancials),
          };
        });
      })()
    : [];

  return (
    <div className="min-h-screen bg-brand-greenTint">
      <Navbar active="/projects" />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <p className={`tag ${CAT_COLOR[project.category] || "text-brand-greenDark"} mb-1`}>{project.category}</p>
            <h1 className="font-heading text-3xl font-extrabold text-brand-ink">{project.title}</h1>
          </div>
          <div className="flex gap-2 shrink-0">
            {perms.canViewFinancials && (
              <Link href={`/projects/${project.id}/financials`} className="btn-secondary text-xs">
                Financials
              </Link>
            )}
            {canEditAnything && (
              <Link href={`/projects/${project.id}/edit`} className="btn-secondary text-xs">
                Edit
              </Link>
            )}
            {isAdmin && <DeleteProjectButton id={project.id} title={project.title} />}
          </div>
        </div>

        <div className="card bg-white overflow-hidden">
          <div className="p-5 border-b border-brand-line flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CompletionRing pct={project.completionPct} status={project.status} />
            {perms.canViewFinancials && <ShareSummary projectId={project.id} projectTitle={project.title} />}
          </div>

          {/* Team */}
          <div className="p-5 border-b border-brand-line">
            <p className="kicker mb-2">Team</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white bg-brand-ink">
                  <th className="px-3 py-2 font-mono text-[11px] tracking-widest">NAME</th>
                  <th className="px-3 py-2 font-mono text-[11px] tracking-widest">TITLE</th>
                  <th className="px-3 py-2 font-mono text-[11px] tracking-widest">ROLE</th>
                  <th className="px-3 py-2 font-mono text-[11px] tracking-widest">TASK(S)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-green-50">
                  <td className="px-3 py-2 font-bold">{project.lead?.name || "—"}</td>
                  <td className="px-3 py-2 text-brand-inkSoft">{project.lead?.title || "—"}</td>
                  <td className="px-3 py-2 text-brand-inkSoft">Project Lead</td>
                  <td className="px-3 py-2 text-brand-inkSoft">—</td>
                </tr>
                {project.members.map((m) => (
                  <tr key={m.id} className="border-t border-brand-line">
                    <td className="px-3 py-2 font-semibold">{m.member.name}</td>
                    <td className="px-3 py-2 text-brand-inkSoft">{m.member.title || "—"}</td>
                    <td className="px-3 py-2 text-brand-inkSoft">{m.role || "—"}</td>
                    <td className="px-3 py-2 text-brand-inkSoft">{m.tasks || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Talking Points */}
          {project.talkingPoints.length > 0 && (
            <div className="p-5 border-b border-brand-line">
              <p className="kicker mb-2">Talking Points</p>
              <ul className="list-disc list-inside space-y-1 text-sm text-brand-inkSoft">
                {project.talkingPoints.map((t) => (
                  <li key={t.id}>{t.text}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Key Dates + To-Do */}
          <div className="grid sm:grid-cols-2 gap-6 p-5 border-b border-brand-line bg-brand-greenTint">
            <div>
              <p className="kicker mb-2">Key Dates</p>
              <div className="space-y-1">
                {project.keyDates.map((k) => (
                  <div key={k.id} className="flex gap-3 text-sm border-b border-brand-line py-1">
                    <span className="font-mono text-brand-inkFaint w-24 shrink-0">{fmtDate(k.date) || "TBD"}</span>
                    <span className="text-brand-inkSoft">{k.milestone}</span>
                  </div>
                ))}
                {project.keyDates.length === 0 && <p className="text-sm text-brand-inkFaint">No key dates yet.</p>}
              </div>
            </div>
            <div>
              <p className="kicker mb-2">To-Do</p>
              <div>
                {project.todos.map((t) => {
                  const canTick = perms.canEditTodos || t.assigneeId === member.id;
                  return (
                    <div key={t.id} className="flex items-start justify-between gap-2">
                      {canTick ? (
                        <ToggleCheckbox id={t.id} checked={t.done} onToggle={toggleTodo} label={t.text} />
                      ) : (
                        <span className={`text-sm py-1 ${t.done ? "line-through text-brand-inkFaint" : "text-brand-inkSoft"}`}>
                          {t.text}
                        </span>
                      )}
                      {t.assignee && (
                        <span className="shrink-0 mt-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-white border border-brand-line text-brand-inkSoft">
                          {t.assignee.name}
                        </span>
                      )}
                    </div>
                  );
                })}
                {project.todos.length === 0 && <p className="text-sm text-brand-inkFaint">No action items yet.</p>}
              </div>
            </div>
          </div>

          {/* Open Questions */}
          <div className="p-5 border-b border-brand-line">
            <p className="kicker mb-2">Open Questions</p>
            <div>
              {project.questions.map((q) =>
                perms.canEditQuestions ? (
                  <ToggleCheckbox key={q.id} id={q.id} checked={q.resolved} onToggle={toggleQuestion} label={q.text} />
                ) : (
                  <p
                    key={q.id}
                    className={`text-sm py-1 ${q.resolved ? "line-through text-brand-inkFaint" : "text-brand-inkSoft"}`}
                  >
                    {q.text}
                  </p>
                )
              )}
              {project.questions.length === 0 && <p className="text-sm text-brand-inkFaint">No open questions.</p>}
            </div>
          </div>

          {/* Site & Owner */}
          <div className="p-5 border-b border-brand-line">
            <p className="kicker mb-3">Site &amp; Owner</p>
            <SiteDetailsForm
              projectId={project.id}
              canEdit={isAdmin || perms.canEditTeam}
              initial={{
                address: project.address || "",
                city: project.city || "",
                state: project.state || "",
                postalCode: project.postalCode || "",
                latitude: project.latitude,
                longitude: project.longitude,
                ownerName: project.ownerName || "",
                ownerCompany: project.ownerCompany || "",
                ownerEmail: project.ownerEmail || "",
                ownerPhone: project.ownerPhone || "",
                ownerNotes: project.ownerNotes || "",
              }}
            />
          </div>

          {/* Incentives — financial in nature, so gated on financial permission */}
          {perms.canViewFinancials && (
            <div className="p-5 border-b border-brand-line">
              <p className="kicker mb-3">Rebates &amp; Incentives</p>
              <RebatePanel
                projectId={project.id}
                state={project.state}
                canEdit={perms.canEditFinancials}
                initial={project.rebates.map((r) => ({
                  name: r.name,
                  authority: r.authority || "State",
                  category: r.category,
                  incentiveType: r.incentiveType,
                  value: r.value,
                  estimatedAmount: r.estimatedAmount,
                  status: r.status,
                  sourceUrl: r.sourceUrl || "",
                  notes: r.notes || "",
                }))}
              />
            </div>
          )}

          {/* Files */}
          {perms.canViewFiles && (
            <div className="p-5 border-b border-brand-line">
              <div className="flex items-center justify-between mb-3">
                <p className="kicker">Files &amp; Documents</p>
                {perms.canUploadFiles && <FileUploader projectId={project.id} />}
              </div>
              <ProjectFiles files={project.files} canDelete={perms.canUploadFiles} />
            </div>
          )}

          {/* Financials */}
          {perms.canViewFinancials ? (
            <FinancialsDetail p={project} />
          ) : (
            <FinancialsLocked />
          )}

          {project.notes && perms.canViewFinancials && (
            <div className="p-5 border-t border-brand-line">
              <p className="kicker mb-2">Notes</p>
              <p className="text-sm italic text-brand-inkSoft">{project.notes}</p>
            </div>
          )}

          {isAdmin && <ProjectAccessPanel projectId={project.id} rows={accessRows} />}
          {isAdmin && <ReportSubscriptions projectId={project.id} rows={subRows} />}
          <ActivityFeed projectId={project.id} />
        </div>
      </main>
    </div>
  );
}
