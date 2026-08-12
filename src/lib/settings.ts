import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

const DEFAULT_PASSWORD = "z1power2026"; // change this immediately after first deploy

/** Fetches the singleton Settings row, creating it (seeded from env or a default) if missing. */
export async function getSettings() {
  let settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (!settings) {
    const initialPassword = process.env.TEAM_PASSWORD || DEFAULT_PASSWORD;
    const passwordHash = await bcrypt.hash(initialPassword, 10);
    settings = await prisma.settings.create({
      data: { id: "singleton", passwordHash, orgName: "Z1Power" },
    });
  }
  return settings;
}

export async function verifyPassword(password: string): Promise<boolean> {
  const settings = await getSettings();
  return bcrypt.compare(password, settings.passwordHash);
}

export async function setPassword(newPassword: string) {
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.settings.update({ where: { id: "singleton" }, data: { passwordHash } });
}

export async function setWhatsAppLink(link: string) {
  await prisma.settings.update({ where: { id: "singleton" }, data: { whatsappLink: link } });
}
