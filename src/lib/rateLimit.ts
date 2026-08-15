import { prisma } from "./prisma";

/**
 * Login rate limiting.
 *
 * Stored in the database rather than memory: Vercel runs many short-lived
 * instances that don't share state, so an in-memory counter would reset
 * constantly and enforce nothing.
 *
 * Two independent limits — per account and per IP — because they stop
 * different attacks. Per-account stops someone guessing one person's password;
 * per-IP stops someone spraying one common password across every account.
 */

const ACCOUNT_LIMIT = 5;
const IP_LIMIT = 20;
const WINDOW_MINUTES = 15;
const LOCKOUT_MINUTES = 15;

export type RateCheck = { allowed: boolean; reason?: string; retryAfterMinutes?: number };

export async function checkLoginAllowed(email: string, ip?: string | null): Promise<RateCheck> {
  try {
    const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
    const account = email.trim().toLowerCase();

    const accountFails = await prisma.loginAttempt.count({
      where: { identifier: account, successful: false, createdAt: { gte: since } },
    });
    if (accountFails >= ACCOUNT_LIMIT) {
      return {
        allowed: false,
        // Deliberately vague — don't confirm whether the account exists.
        reason: `Too many sign-in attempts. Try again in ${LOCKOUT_MINUTES} minutes.`,
        retryAfterMinutes: LOCKOUT_MINUTES,
      };
    }

    if (ip) {
      const ipFails = await prisma.loginAttempt.count({
        where: { identifier: `ip:${ip}`, successful: false, createdAt: { gte: since } },
      });
      if (ipFails >= IP_LIMIT) {
        return {
          allowed: false,
          reason: `Too many sign-in attempts from this location. Try again in ${LOCKOUT_MINUTES} minutes.`,
          retryAfterMinutes: LOCKOUT_MINUTES,
        };
      }
    }

    return { allowed: true };
  } catch (e) {
    // If the check itself fails, let the login proceed rather than locking
    // everyone out of the app over a rate-limiter bug.
    console.error("[rate limit] check failed, allowing:", e);
    return { allowed: true };
  }
}

export async function recordLoginAttempt(email: string, successful: boolean, ip?: string | null) {
  try {
    const account = email.trim().toLowerCase();
    await prisma.loginAttempt.createMany({
      data: [
        { identifier: account, successful, ipAddress: ip ?? null },
        ...(ip ? [{ identifier: `ip:${ip}`, successful, ipAddress: ip }] : []),
      ],
    });

    // A successful sign-in clears the account's failures so a legitimate user
    // isn't still counting down after they get in.
    if (successful) {
      await prisma.loginAttempt.deleteMany({ where: { identifier: account, successful: false } });
    }

    // Opportunistic cleanup so the table doesn't grow forever.
    if (Math.random() < 0.02) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
      await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } });
    }
  } catch (e) {
    console.error("[rate limit] failed to record attempt:", e);
  }
}
