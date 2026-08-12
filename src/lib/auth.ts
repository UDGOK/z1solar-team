import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "z1_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type SessionRole = "MEMBER" | "ADMIN";
export type Session = { role: SessionRole; adminId?: string };

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    throw new Error(
      "SESSION_SECRET is not set. Add it to your environment variables (any long random string)."
    );
  }
  return s;
}

function sign(value: string) {
  return crypto.createHmac("sha256", secret()).update(value).digest("hex");
}

function setSessionCookie(payload: string) {
  const token = `${payload}.${sign(payload)}`;
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** Shared team-password login — everyone who isn't an admin uses this. */
export async function createMemberSession() {
  setSessionCookie("member");
}

/** Individual admin login — payload carries which TeamMember is logged in. */
export async function createAdminSession(adminId: string) {
  setSessionCookie(`admin:${adminId}`);
}

export async function destroySession() {
  cookies().delete(COOKIE_NAME);
}

/** Reads and verifies the session cookie. Returns null if missing/invalid/tampered. */
export async function getSession(): Promise<Session | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  try {
    const expected = sign(payload);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  if (payload === "member") return { role: "MEMBER" };
  if (payload.startsWith("admin:")) return { role: "ADMIN", adminId: payload.slice(6) };
  return null;
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getSession()) !== null;
}

export async function isAdmin(): Promise<boolean> {
  const session = await getSession();
  return session?.role === "ADMIN";
}

/** Call at the top of any protected Server Component page; redirects to /login if not authenticated. */
export async function requirePageAuth(): Promise<Session> {
  const { redirect } = await import("next/navigation");
  const session = await getSession();
  if (!session) redirect("/login");
  return session as Session;
}

/** Call at the top of admin-only pages; redirects non-admins back to the dashboard. */
export async function requirePageAdmin(): Promise<Session> {
  const { redirect } = await import("next/navigation");
  const session = await getSession();
  if (!session) redirect("/login");
  if (session!.role !== "ADMIN") redirect("/dashboard");
  return session as Session;
}
