import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "z1_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

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

/** Called after a correct password check to start a session. */
export async function createSession() {
  const payload = "authenticated";
  const token = `${payload}.${sign(payload)}`;
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  cookies().delete(COOKIE_NAME);
}

/** Returns true if the request carries a valid, unmodified session cookie. */
export async function isAuthenticated(): Promise<boolean> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  try {
    const expected = sign(payload);
    // constant-time comparison
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b) && payload === "authenticated";
  } catch {
    return false;
  }
}

/** Call at the top of any protected Server Component page; redirects to /login if not authenticated. */
export async function requirePageAuth() {
  const { redirect } = await import("next/navigation");
  const ok = await isAuthenticated();
  if (!ok) redirect("/login");
}
