import { prisma } from "./prisma";

/** Fetches the singleton Settings row, creating it if missing. */
export async function getSettings() {
  let settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (!settings) {
    settings = await prisma.settings.create({ data: { id: "singleton", orgName: "Z1Power" } });
  }
  return settings;
}

export async function setWhatsAppLink(link: string) {
  await prisma.settings.update({ where: { id: "singleton" }, data: { whatsappLink: link } });
}
