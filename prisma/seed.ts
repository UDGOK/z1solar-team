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
  // Bootstrap the team ONLY on an empty database.
  //
  // This used to run every time, matching on exact name. Once someone was
  // renamed in the app — "Yasir" to "Yasir Jahangir" — the lookup stopped
  // finding them and the seed helpfully created a fresh, empty "Yasir". Every
  // deploy that ran the seed added another round of nameless duplicates with no
  // email, no phone and no way to sign in, sitting alongside the real people.
  //
  // The team is real data now, maintained in the app. It is not seed data, and
  // the seed has no business recreating it.
  const teamCount = await prisma.teamMember.count();
  const memberByName = new Map<string, string>();

  if (teamCount === 0) {
    console.log("Seeding team members (empty database)…");
    for (const t of TEAM) {
      const member = await prisma.teamMember.create({
        data: { name: t.name, title: t.title || undefined },
      });
      memberByName.set(t.name, member.id);
    }
  } else {
    console.log(`Team already has ${teamCount} member(s) — leaving it alone.`);
    // Still needed to resolve project leads below. Matched loosely so a renamed
    // person ("Yasir" -> "Yasir Jahangir") still resolves instead of being
    // treated as missing.
    const all = await prisma.teamMember.findMany({ select: { id: true, name: true } });
    for (const t of TEAM) {
      const hit =
        all.find((m) => m.name.toLowerCase() === t.name.toLowerCase()) ??
        all.find((m) => m.name.toLowerCase().startsWith(t.name.toLowerCase() + " "));
      if (hit) memberByName.set(t.name, hit.id);
    }
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
    // Match on email FIRST. Names get edited in the app (e.g. "Yasir" becomes
    // "Yasir Jahangir"), and a name-only lookup then finds a different record
    // and tries to give it an email that's already taken — which fails with a
    // unique-constraint error and aborts the whole seed.
    const byEmail = await prisma.teamMember.findUnique({ where: { email: a.email } });
    if (byEmail) {
      if (byEmail.role !== "ADMIN") {
        await prisma.teamMember.update({ where: { id: byEmail.id }, data: { role: "ADMIN" } });
        console.log(`  ${byEmail.name} promoted to ADMIN (matched on ${a.email}).`);
      } else {
        console.log(`  ${byEmail.name} is already an admin — skipping.`);
      }
      continue;
    }

    const found = await prisma.teamMember.findFirst({ where: { name: a.name } });
    if (!found) {
      console.log(`  No team member with email ${a.email} or named "${a.name}" — skipping.`);
      continue;
    }
    if (found.email && found.email !== a.email) {
      console.log(`  "${found.name}" already signs in as ${found.email} — leaving it alone.`);
      if (found.role !== "ADMIN") {
        await prisma.teamMember.update({ where: { id: found.id }, data: { role: "ADMIN" } });
        console.log(`  ${found.name} promoted to ADMIN.`);
      }
      continue;
    }
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
      canManageCategories: true, canViewMeetings: true, canManageMeetings: true, canTakeMeetingNotes: true, canViewResources: true, canManageResources: true,
      canViewSms: true, canSendSms: true, canManageSmsContacts: true,
      canRequestPurchases: true, canApprovePurchases: true, canViewAllPurchases: true, canRecordPayments: true,
      canViewAuditLog: true, canRestoreBackup: true,
      defaultCanEditTalkingPoints: true, defaultCanEditKeyDates: true, defaultCanEditTodos: true,
      defaultCanEditQuestions: true, defaultCanEditTeam: true, defaultCanViewFiles: true,
      defaultCanUploadFiles: true, defaultCanViewFinancials: true, defaultCanEditFinancials: true,
      defaultCanEditStatus: true },
    { name: "Sub-Admin", description: "Nearly full access, but can't manage roles or delete others' projects.", isSystem: false, rank: 80,
      canCreateProjects: true, canDeleteAnyProject: false, canViewAllProjects: true, canEditAllProjects: true,
      canViewAllFinancials: true, canEditAllFinancials: true, canManageTeam: true, canManageRoles: false,
      canSendAlerts: true, canManageTradeShows: true, canViewReports: true,
      canManageCategories: true, canViewMeetings: true, canManageMeetings: true, canTakeMeetingNotes: true, canViewResources: true, canManageResources: true,
      canViewSms: true, canSendSms: true, canManageSmsContacts: true,
      canRequestPurchases: true, canApprovePurchases: true, canViewAllPurchases: true, canRecordPayments: true,
      canViewAuditLog: true, canRestoreBackup: false,
      defaultCanEditTalkingPoints: true, defaultCanEditKeyDates: true, defaultCanEditTodos: true,
      defaultCanEditQuestions: true, defaultCanEditTeam: true, defaultCanViewFiles: true,
      defaultCanUploadFiles: true, defaultCanViewFinancials: true, defaultCanEditFinancials: false,
      defaultCanEditStatus: true },
    { name: "Supervisor", description: "Sees every project and can create their own. Read-only on other people's financials.", isSystem: false, rank: 60,
      canCreateProjects: true, canDeleteAnyProject: false, canViewAllProjects: true, canEditAllProjects: false,
      canViewAllFinancials: true, canEditAllFinancials: false, canManageTeam: false, canManageRoles: false,
      canSendAlerts: true, canManageTradeShows: true, canViewReports: true,
      canManageCategories: false, canViewMeetings: true, canManageMeetings: true, canTakeMeetingNotes: true, canViewResources: true, canManageResources: true,
      canViewSms: true, canSendSms: true, canManageSmsContacts: false,
      canRequestPurchases: true, canApprovePurchases: true, canViewAllPurchases: true, canRecordPayments: false,
      canViewAuditLog: true, canRestoreBackup: false,
      defaultCanEditTalkingPoints: true, defaultCanEditKeyDates: true, defaultCanEditTodos: true,
      defaultCanEditQuestions: true, defaultCanEditTeam: false, defaultCanViewFiles: true,
      defaultCanUploadFiles: true, defaultCanViewFinancials: true, defaultCanEditFinancials: false,
      defaultCanEditStatus: true },
    { name: "Project Lead", description: "Creates and fully controls their own projects. No access to others' unless granted.", isSystem: false, rank: 40,
      canCreateProjects: true, canDeleteAnyProject: false, canViewAllProjects: false, canEditAllProjects: false,
      canViewAllFinancials: false, canEditAllFinancials: false, canManageTeam: false, canManageRoles: false,
      canSendAlerts: false, canManageTradeShows: false, canViewReports: false,
      canManageCategories: false, canViewMeetings: true, canManageMeetings: false, canTakeMeetingNotes: false, canViewResources: true, canManageResources: false,
      canViewSms: true, canSendSms: true, canManageSmsContacts: false,
      canRequestPurchases: true, canApprovePurchases: false, canViewAllPurchases: false, canRecordPayments: false,
      canViewAuditLog: false, canRestoreBackup: false,
      defaultCanEditTalkingPoints: true, defaultCanEditKeyDates: true, defaultCanEditTodos: true,
      defaultCanEditQuestions: true, defaultCanEditTeam: true, defaultCanViewFiles: true,
      defaultCanUploadFiles: true, defaultCanViewFinancials: false, defaultCanEditFinancials: false,
      defaultCanEditStatus: true },
    { name: "Member", description: "Only sees projects explicitly shared with them.", isSystem: true, rank: 10,
      canCreateProjects: false, canDeleteAnyProject: false, canViewAllProjects: false, canEditAllProjects: false,
      canViewAllFinancials: false, canEditAllFinancials: false, canManageTeam: false, canManageRoles: false,
      canSendAlerts: false, canManageTradeShows: false, canViewReports: false,
      canManageCategories: false, canViewMeetings: true, canManageMeetings: false, canTakeMeetingNotes: false, canViewResources: true, canManageResources: false,
      canViewSms: false, canSendSms: false, canManageSmsContacts: false,
      canRequestPurchases: true, canApprovePurchases: false, canViewAllPurchases: false, canRecordPayments: false,
      canViewAuditLog: false, canRestoreBackup: false,
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

  // Vendor tags used to categorise trade show exhibitors. Seeded here rather
  // than lazily on first page load, so the tag filter is already populated the
  // moment the first exhibitor list is imported.
  //
  // Matched on slug (the lowercased name) rather than name, so re-running the
  // seed after someone renames "Data Centre" to "Data Center" doesn't recreate
  // it — the same case-insensitivity the create and rename actions enforce.
  console.log("Seeding vendor tags…");
  const VENDOR_TAGS = [
    "Inverters", "BESS", "Modules", "Racking", "Trackers", "BOS", "Switchgear",
    "Transformers", "Generation", "Cooling", "Data Centre", "EPC", "O&M",
    "Financing", "Legal", "Software", "Fibre & Telecom", "Manufacturer",
    "Developer", "Consulting",
  ];
  let tagOrder = 0;
  let tagsCreated = 0;
  for (const name of VENDOR_TAGS) {
    const slug = name.trim().toLowerCase();
    const existing = await prisma.vendorTag.findUnique({ where: { slug } });
    if (!existing) {
      await prisma.vendorTag.create({ data: { name, slug, sortOrder: tagOrder } });
      tagsCreated++;
    }
    tagOrder++;
  }
  console.log(
    tagsCreated > 0
      ? `  Created ${tagsCreated} vendor tag(s).`
      : "  All vendor tags already present — nothing to do."
  );

  // --- Project codes for SMS routing ---
  // Derived from the title: first significant word, or an acronym for longer
  // names. Uniqueness is enforced with a numeric suffix rather than failing.
  console.log("Assigning project codes…");
  function deriveCode(title: string): string {
    // A parenthetical is almost always the distinguishing part — "Data Center,
    // OK (Mead)" is MEAD, not DATA, and that also avoids colliding with every
    // other project starting "Data Center".
    const paren = title.match(/\(([^)]+)\)/);
    if (paren) {
      const inner = paren[1].replace(/[^A-Za-z0-9 ]/g, " ").trim();
      const w = inner.split(/\s+/).filter((x) => x.length > 2 && !/^(the|and|for|inc|llc)$/i.test(x));
      if (w.length) return w[0].toUpperCase().slice(0, 10);
    }

    const cleaned = title.replace(/[^A-Za-z0-9 ]/g, " ").trim();
    const words = cleaned
      .split(/\s+/)
      .filter((w) => w.length > 1 && !/^(the|and|for|inc|llc|of|at)$/i.test(w));
    if (words.length === 0) return "PROJ";

    // Generic leading words don't identify anything on their own — prefer the
    // word that actually distinguishes this project from its siblings.
    const GENERIC = /^(data|center|centre|project|new|usa|us|uk|ksa)$/i;
    const distinctive = words.find((w) => !GENERIC.test(w) && w.length >= 4);
    // Only use a whole word if it fits — truncating gives "CERTIFICAT", which
    // reads like a typo. Fall back to an acronym instead.
    if (distinctive && distinctive.length <= 9) return distinctive.toUpperCase();
    if (distinctive && words.length === 1) return distinctive.toUpperCase().slice(0, 6);

    // Otherwise build an acronym rather than truncating a single long word
    // mid-syllable ("CERTIFICAT" reads like a typo).
    if (words.length > 1) return words.map((w) => w[0]).join("").toUpperCase().slice(0, 10);
    return words[0].toUpperCase().slice(0, 10);
  }

  const needCodes = await prisma.project.findMany({ where: { code: null }, select: { id: true, title: true } });
  const taken = new Set(
    (await prisma.project.findMany({ where: { code: { not: null } }, select: { code: true } }))
      .map((p) => p.code!)
  );
  for (const proj of needCodes) {
    let code = deriveCode(proj.title);
    let n = 2;
    while (taken.has(code)) code = `${deriveCode(proj.title).slice(0, 8)}${n++}`;
    taken.add(code);
    await prisma.project.update({ where: { id: proj.id }, data: { code } });
    console.log(`  ${proj.title} -> ${code}`);
  }

  // --- Team phone numbers into the approved SMS list ---
  // Team members could always text in (they're matched on TeamMember.phone),
  // but they were invisible on the Approved numbers screen, which made the
  // allowlist look incomplete. Mirroring them makes it truthful.
  console.log("Syncing team phones into approved SMS numbers…");
  function normalise(raw: string | null): string | null {
    if (!raw) return null;
    const bare = raw.replace(/\D/g, "");
    if (bare.length === 10) return `+1${bare}`;
    if (bare.length === 11 && bare.startsWith("1")) return `+${bare}`;
    return bare ? `+${bare}` : null;
  }
  const withPhones = await prisma.teamMember.findMany({ where: { phone: { not: null } } });
  let added = 0;
  for (const m of withPhones) {
    const phone = normalise(m.phone);
    if (!phone) continue;
    const existing = await prisma.smsContact.findUnique({ where: { phone } });
    if (existing) continue;
    await prisma.smsContact.create({
      data: { phone, name: m.name, company: "Z1Power (team)", active: true, notes: "Synced from team directory" },
    });
    added++;
  }
  if (added) console.log(`  Added ${added} team number(s) to the approved list.`);

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
