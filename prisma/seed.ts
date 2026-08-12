import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

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

  console.log("Seeding settings (password, org name)…");
  const existingSettings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (!existingSettings) {
    const initialPassword = process.env.TEAM_PASSWORD || "z1power2026";
    const passwordHash = await bcrypt.hash(initialPassword, 10);
    await prisma.settings.create({ data: { id: "singleton", passwordHash, orgName: "Z1Power" } });
    console.log(`  Default team password set to: ${initialPassword} (change it in Settings after first login)`);
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

  // Bootstrap the first admin account. Without this, there's a chicken-and-egg
  // problem — no admin exists yet to promote anyone from the Settings UI.
  // Safe to re-run: if Yasir is already an admin, this does nothing.
  console.log("Bootstrapping first admin account…");
  const bootstrapAdmin = await prisma.teamMember.findFirst({ where: { name: "Yasir" } });
  if (bootstrapAdmin && bootstrapAdmin.role !== "ADMIN") {
    const adminEmail = bootstrapAdmin.email || "yasir@z1power-admin.local";
    const adminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || "Z1PowerAdmin2026!";
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await prisma.teamMember.update({
      where: { id: bootstrapAdmin.id },
      data: { role: "ADMIN", email: adminEmail, passwordHash },
    });
    console.log(`  Yasir promoted to ADMIN.`);
    console.log(`  Admin login — email: ${adminEmail}  password: ${adminPassword}`);
    console.log(`  Change this password immediately from Settings after logging in.`);
    if (!bootstrapAdmin.email) {
      console.log(`  Note: no email was on file for Yasir, so a placeholder was used.`);
      console.log(`  Update it in Team Directory to your real email before relying on this login.`);
    }
  } else if (bootstrapAdmin) {
    console.log(`  Yasir is already an admin — skipping.`);
  } else {
    console.log(`  No team member named "Yasir" found — skipping admin bootstrap.`);
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
