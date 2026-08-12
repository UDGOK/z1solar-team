import { getServerSession } from "next-auth";
import { authOptions } from "./authOptions";
import { prisma } from "./prisma";

export type CurrentMember = {
  id: string;
  name: string;
  email: string;
  role: "MEMBER" | "ADMIN";
};

/**
 * Returns the signed-in TeamMember, looked up fresh from the database on
 * every call. This is deliberate: role and per-project access are DB state,
 * not baked into the session token, so a permission change by an admin
 * takes effect on the person's very next page load — not their next login.
 */
export async function getCurrentMember(): Promise<CurrentMember | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const member = await prisma.teamMember.findUnique({ where: { email: session.user.email } });
  if (!member) return null;
  return { id: member.id, name: member.name, email: member.email!, role: member.role as "MEMBER" | "ADMIN" };
}

export async function isAdmin(): Promise<boolean> {
  const member = await getCurrentMember();
  return member?.role === "ADMIN";
}

/** Call at the top of any protected Server Component page; redirects to /login if not signed in. */
export async function requirePageAuth(): Promise<CurrentMember> {
  const { redirect } = await import("next/navigation");
  const member = await getCurrentMember();
  if (!member) redirect("/login");
  return member as CurrentMember;
}

/** Call at the top of admin-only pages; redirects non-admins back to the dashboard. */
export async function requirePageAdmin(): Promise<CurrentMember> {
  const { redirect } = await import("next/navigation");
  const member = await getCurrentMember();
  if (!member) redirect("/login");
  if (member!.role !== "ADMIN") redirect("/dashboard");
  return member as CurrentMember;
}
