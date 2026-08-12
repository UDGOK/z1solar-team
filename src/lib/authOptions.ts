import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "./prisma";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Add it to your environment variables.`);
  return v;
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: requiredEnv("GOOGLE_CLIENT_ID"),
      clientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    // Only let someone in if their Google email matches an existing TeamMember.
    // This is the entire "allowlist" — there's no separate account-creation
    // step; an admin adds people to the Team Directory, and that's what
    // grants them the ability to sign in at all.
    async signIn({ user }) {
      if (!user.email) return false;
      const member = await prisma.teamMember.findUnique({ where: { email: user.email } });
      return !!member;
    },
    // Keep the JWT minimal — just identity. Role and permissions are looked
    // up fresh from the database on every request (see lib/auth.ts), so a
    // permission change by an admin takes effect immediately, not just on
    // the next login.
    async jwt({ token, user }) {
      if (user?.email) token.email = user.email;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.email) session.user.email = token.email as string;
      return session;
    },
  },
};
