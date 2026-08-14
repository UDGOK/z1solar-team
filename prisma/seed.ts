import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEAM = [
  { name: "Yasir", title: "COO" },
  { name: "Syed", title: null },
  { name: "Ali", title: null },
  { name: "Mohammad", title: null },
  { name: "Ken", title: null },
  { name: "Shahab", title: null },
  { name: "Javaid", title: null },
  { name: "Daniel", title: null },
  { name: "Ryan", title: null },
];

const PROJECTS: {
  title: string;
  category: string;
  leadName: string;
  talkingPoints: string[];
  keyDates: { milestone: string }[];
  todos: string[];
  notes?: string;
}[] = [
  {
    title: "Carson",
    category: "Solar & Battery",
    leadName: "Ali",
    talkingPoints: ["Site status update", "Interconnection / utility coordination", "Outstanding field items"],
    keyDates: [],
    todos: [],
  },
  {
    title: "Terry",
    category: "Solar & Battery",
    leadName: "Mohammad",
    talkingPoints: ["Site status update", "Interconnection / utility coordination", "Outstanding field items"],
    keyDates: [],
    todos: [],
  },
  {
    title: "Branson Waterpark",
    category: "Solar & Battery",
    leadName: "Ken",
    talkingPoints: ["Site status update", "Controls / commissioning status", "Outstanding field items"],
    keyDates: [],
    todos: [],
  },
  {
    title: "Arena Badminton",
    category: "Solar & Battery",
    leadName: "Shahab",
    talkingPoints: ["Site status update", "Controls / commissioning status", "Outstanding field items"],
    keyDates: [],
    todos: [],
  },
  {
    title: "Bear Valley",
    category: "Solar & Battery",
    leadName: "Javaid",
    talkingPoints: ["Site status update", "Interconnection / utility coordination", "Outstanding field items"],
    keyDates: [],
    todos: [],
  },
  {
    title: "Data Center, OK (Mead)",
    category: "Other Projects",
    leadName: "Daniel",
    talkingPoints: [
      "208V 3-Phase, 3,000A service — confirm on-site power status",
      "Building on site — confirm structure status / readiness",
      "Order 15-ton HVAC unit",
      "Order NVIDIA B200 servers plus supporting components — pull specs/pricing from SmartTec",
    ],
    keyDates: [
      { milestone: "On-site power confirmed" },
      { milestone: "HVAC ordered / delivered" },
      { milestone: "B200 servers ordered / delivered" },
    ],
    todos: [
      "Confirm 208V 3-Phase, 3,000A service is live on site",
      "Confirm building structure status / readiness",
      "Order 15-ton HVAC unit",
      "Order NVIDIA B200 servers + supporting components (pull specs/pricing from SmartTec)",
    ],
    notes: "Full line-item cost breakdown lives in the project notes / attachments once quotes come in.",
  },
  {
    title: "UK Partnership",
    category: "Other Projects",
    leadName: "Ryan",
    talkingPoints: ["Partnership status update", "Open commercial / legal items", "Next milestone"],
    keyDates: [],
    todos: [],
  },
  {
    title: "KSA Cell Mfg",
    category: "Other Projects",
    leadName: "Syed",
    talkingPoints: ["Manufacturing partnership status", "Open commercial / legal items", "Next milestone"],
    keyDates: [],
    todos: [],
  },
  {
    title: "KSA Battery",
    category: "Other Projects",
    leadName: "Ali",
    talkingPoints: ["Supply agreement status", "Open commercial / legal items", "Next milestone"],
    keyDates: [],
    todos: [],
  },
  {
    title: "Inverter",
    category: "Other Matters",
    leadName: "Mohammad",
    talkingPoints: ["Sourcing / qualification status", "Open engineering items"],
    keyDates: [],
    todos: [],
  },
  {
    title: "UL Certification",
    category: "Other Matters",
    leadName: "Ken",
    talkingPoints: ["Certification status / testing stage", "Open action items"],
    keyDates: [],
    todos: [],
  },
  {
    title: "9540 Certification",
    category: "Other Matters",
    leadName: "Shahab",
    talkingPoints: ["Certification status / testing stage", "Open action items"],
    keyDates: [],
    todos: [],
  },
  {
    title: "Data Centers (Strategy)",
    category: "Other Matters",
    leadName: "Daniel",
    talkingPoints: ["Broader data center strategy discussion", "Pipeline of future sites"],
    keyDates: [],
    todos: [],
  },
  {
    title: "Data Center Off-Takers (Lectra and alternatives)",
    category: "Other Matters",
    leadName: "Ryan",
    talkingPoints: ["Lectra status update", "Alternative off-taker pipeline"],
    keyDates: [],
    todos: [],
  },
  {
    title: "Power Guard",
    category: "Other Matters",
    leadName: "Javaid",
    talkingPoints: ["Product status update", "Open action items"],
    keyDates: [],
    todos: [],
  },
  {
    title: "Residential Leasing Programs",
    category: "Other Matters",
    leadName: "Syed",
    talkingPoints: ["Program design status", "Go-to-market next steps"],
    keyDates: [],
    todos: [],
  },
];

async function main() {
  console.log("Seeding team members…");
  const memberByName = new Map<string, string>();
  for (const t of TEAM) {
    const existing = await prisma.teamMember.findFirst({ where: { name: t.name } });
    const member =
      existing ||
      (await prisma.teamMember.create({ data: { name: t.name, title: t.title || undefined } }));
    memberByName.set(t.name, member.id);
  }

  console.log("Seeding settings (org name)…");
  const existingSettings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (!existingSettings) {
    await prisma.settings.create({ data: { id: "singleton", orgName: "Z1Power" } });
  }

  console.log("Seeding projects…");
  for (const p of PROJECTS) {
    const existing = await prisma.project.findFirst({ where: { title: p.title } });
    if (existing) {
      console.log(`  Skipping "${p.title}" — already exists.`);
      continue;
    }
    await prisma.project.create({
      data: {
        title: p.title,
        category: p.category,
        leadId: memberByName.get(p.leadName) || null,
        notes: p.notes || null,
        talkingPoints: { create: p.talkingPoints.map((text, order) => ({ text, order })) },
        keyDates: { create: p.keyDates.map((k, order) => ({ milestone: k.milestone, order })) },
        todos: { create: p.todos.map((text, order) => ({ text, order })) },
      },
    });
    console.log(`  Created "${p.title}"`);
  }

  // Bootstrap the founding admins. There's no password anymore — Google
  // handles identity — so this just sets each person's real sign-in email
  // and promotes them to ADMIN. Safe to re-run: already-correct records are
  // left alone.
  console.log("Bootstrapping admin accounts…");
  const ADMIN_ACCOUNTS = [
    { name: "Yasir", email: "yasir@futonix.com" },
    { name: "Mohammad", email: "muzz.siddiki@gmail.com" },
  ];
  for (const a of ADMIN_ACCOUNTS) {
    const found = await prisma.teamMember.findFirst({ where: { name: a.name } });
    if (!found) {
      console.log(`  No team member named "${a.name}" found — skipping.`);
      continue;
    }
    if (found.role === "ADMIN" && found.email === a.email) {
      console.log(`  ${a.name} is already an admin with the correct email — skipping.`);
      continue;
    }
    // Email must be unique — if another record already has this email
    // (shouldn't happen in normal use), this will throw loudly rather than
    // silently overwrite someone else's login.
    await prisma.teamMember.update({
      where: { id: found.id },
      data: { role: "ADMIN", email: a.email },
    });
    console.log(`  ${a.name} promoted to ADMIN — signs in with Google using: ${a.email}`);
  }

  // --- Roles ---
  console.log("Seeding roles…");
  const ROLES = [
    { name: "Administrator", description: "Full system access.", isSystem: true, rank: 100,
      canCreateProjects: true, canDeleteAnyProject: true, canViewAllProjects: true, canEditAllProjects: true,
      canViewAllFinancials: true, canEditAllFinancials: true, canManageTeam: true, canManageRoles: true,
      canSendAlerts: true, canManageTradeShows: true, canViewReports: true,
      defaultCanEditTalkingPoints: true, defaultCanEditKeyDates: true, defaultCanEditTodos: true,
      defaultCanEditQuestions: true, defaultCanEditTeam: true, defaultCanViewFiles: true,
      defaultCanUploadFiles: true, defaultCanViewFinancials: true, defaultCanEditFinancials: true,
      defaultCanEditStatus: true },
    { name: "Sub-Admin", description: "Nearly full access, but can't manage roles or delete others' projects.", isSystem: false, rank: 80,
      canCreateProjects: true, canDeleteAnyProject: false, canViewAllProjects: true, canEditAllProjects: true,
      canViewAllFinancials: true, canEditAllFinancials: true, canManageTeam: true, canManageRoles: false,
      canSendAlerts: true, canManageTradeShows: true, canViewReports: true,
      defaultCanEditTalkingPoints: true, defaultCanEditKeyDates: true, defaultCanEditTodos: true,
      defaultCanEditQuestions: true, defaultCanEditTeam: true, defaultCanViewFiles: true,
      defaultCanUploadFiles: true, defaultCanViewFinancials: true, defaultCanEditFinancials: false,
      defaultCanEditStatus: true },
    { name: "Supervisor", description: "Sees every project and can create their own. Read-only on other people's financials.", isSystem: false, rank: 60,
      canCreateProjects: true, canDeleteAnyProject: false, canViewAllProjects: true, canEditAllProjects: false,
      canViewAllFinancials: true, canEditAllFinancials: false, canManageTeam: false, canManageRoles: false,
      canSendAlerts: true, canManageTradeShows: true, canViewReports: true,
      defaultCanEditTalkingPoints: true, defaultCanEditKeyDates: true, defaultCanEditTodos: true,
      defaultCanEditQuestions: true, defaultCanEditTeam: false, defaultCanViewFiles: true,
      defaultCanUploadFiles: true, defaultCanViewFinancials: true, defaultCanEditFinancials: false,
      defaultCanEditStatus: true },
    { name: "Project Lead", description: "Creates and fully controls their own projects. No access to others' unless granted.", isSystem: false, rank: 40,
      canCreateProjects: true, canDeleteAnyProject: false, canViewAllProjects: false, canEditAllProjects: false,
      canViewAllFinancials: false, canEditAllFinancials: false, canManageTeam: false, canManageRoles: false,
      canSendAlerts: false, canManageTradeShows: false, canViewReports: false,
      defaultCanEditTalkingPoints: true, defaultCanEditKeyDates: true, defaultCanEditTodos: true,
      defaultCanEditQuestions: true, defaultCanEditTeam: true, defaultCanViewFiles: true,
      defaultCanUploadFiles: true, defaultCanViewFinancials: false, defaultCanEditFinancials: false,
      defaultCanEditStatus: true },
    { name: "Member", description: "Only sees projects explicitly shared with them.", isSystem: true, rank: 10,
      canCreateProjects: false, canDeleteAnyProject: false, canViewAllProjects: false, canEditAllProjects: false,
      canViewAllFinancials: false, canEditAllFinancials: false, canManageTeam: false, canManageRoles: false,
      canSendAlerts: false, canManageTradeShows: false, canViewReports: false,
      defaultCanEditTalkingPoints: true, defaultCanEditKeyDates: false, defaultCanEditTodos: true,
      defaultCanEditQuestions: false, defaultCanEditTeam: false, defaultCanViewFiles: true,
      defaultCanUploadFiles: false, defaultCanViewFinancials: false, defaultCanEditFinancials: false,
      defaultCanEditStatus: false },
  ];
  const roleByName = new Map<string, string>();
  for (const r of ROLES) {
    const existing = await prisma.role.findFirst({ where: { name: r.name } });
    const row = existing
      ? await prisma.role.update({ where: { id: existing.id }, data: r })
      : await prisma.role.create({ data: r });
    roleByName.set(r.name, row.id);
    console.log(`  ${existing ? "Updated" : "Created"} role "${r.name}"`);
  }

  // Give everyone a role if they don't have one yet.
  const adminRoleId = roleByName.get("Administrator")!;
  const memberRoleId = roleByName.get("Member")!;
  const unroled = await prisma.teamMember.findMany({ where: { roleId: null } });
  for (const m of unroled) {
    await prisma.teamMember.update({
      where: { id: m.id },
      data: { roleId: m.role === "ADMIN" ? adminRoleId : memberRoleId },
    });
  }
  if (unroled.length) console.log(`  Assigned default roles to ${unroled.length} member(s).`);

  // Backfill ownership so existing projects aren't orphaned.
  const firstAdmin = await prisma.teamMember.findFirst({ where: { role: "ADMIN" } });
  if (firstAdmin) {
    const orphaned = await prisma.project.updateMany({
      where: { ownerId: null },
      data: { ownerId: firstAdmin.id },
    });
    if (orphaned.count) console.log(`  Assigned ownership of ${orphaned.count} existing project(s) to ${firstAdmin.name}.`);
  }

  // Migrate legacy single-assignee tasks into the many-to-many table.
  // Idempotent: skipDuplicates means re-running is harmless.
  console.log("Migrating task assignees…");
  const legacy = await prisma.todo.findMany({
    where: { assigneeId: { not: null } },
    select: { id: true, assigneeId: true },
  });
  if (legacy.length) {
    // Not using createMany({ skipDuplicates }) — that option is unsupported on
    // SQLite, and upsert works identically on every provider while keeping the
    // migration safely re-runnable.
    let migrated = 0;
    for (const t of legacy) {
      const res = await prisma.todoAssignee.upsert({
        where: { todoId_memberId: { todoId: t.id, memberId: t.assigneeId! } },
        create: { todoId: t.id, memberId: t.assigneeId! },
        update: {},
      });
      if (res) migrated++;
    }
    console.log(`  Migrated ${migrated} of ${legacy.length} task assignment(s) to multi-assignee.`);
  } else {
    console.log("  No legacy assignments to migrate.");
  }

  // Seed project categories from whatever the live projects already use, so
  // the editable list matches reality rather than a hard-coded guess.
  console.log("Seeding project categories…");
  const CAT_COLORS: Record<string, string> = {
    "Solar & Battery": "#4CAB3E",
    "Data Centers": "#3F9634",
    Certifications: "#E8743B",
    International: "#1C1C1C",
    "Other Projects": "#3F9634",
    "Other Matters": "#8A8A85",
    "New Project": "#E8743B",
  };
  const distinct = await prisma.project.findMany({ select: { category: true }, distinct: ["category"] });
  const names = new Set<string>(distinct.map((d) => d.category));
  for (const n of Object.keys(CAT_COLORS)) names.add(n);
  let order = 0;
  for (const name of Array.from(names)) {
    const existing = await prisma.category.findFirst({ where: { name } });
    if (!existing) {
      await prisma.category.create({ data: { name, color: CAT_COLORS[name] ?? "#8A8A85", order: order++ } });
      console.log(`  Created category "${name}"`);
    }
  }

  // Starter resource library.
  console.log("Seeding resource categories…");
  const RESOURCE_CATS = [
    { name: "Marketing Flyers", description: "Brochures, one-pagers and sell sheets.", icon: "megaphone", color: "#E8743B", order: 0 },
    { name: "Knowledge Base", description: "How-tos, process docs and internal guides.", icon: "book", color: "#4CAB3E", order: 1 },
    { name: "Spec Sheets", description: "Equipment datasheets and technical specs.", icon: "file", color: "#3F9634", order: 2 },
    { name: "Templates", description: "Reusable proposal, contract and report templates.", icon: "template", color: "#8A8A85", order: 3 },
    { name: "Certifications", description: "UL, 9540 and compliance documentation.", icon: "badge", color: "#1C1C1C", order: 4 },
  ];
  for (const rc of RESOURCE_CATS) {
    const existing = await prisma.resourceCategory.findFirst({ where: { name: rc.name } });
    if (!existing) {
      await prisma.resourceCategory.create({ data: rc });
      console.log(`  Created resource category "${rc.name}"`);
    }
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
