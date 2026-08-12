import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
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
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const member = await prisma.teamMember.findUnique({
          where: { email: credentials.email.trim().toLowerCase() },
        });
        // No account, or account has no password set yet (Google-only user)
        if (!member?.passwordHash) return null;
        const valid = await bcrypt.compare(credentials.password, member.passwordHash);
        if (!valid) return null;
        return { id: member.id, email: member.email!, name: member.name };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    // Google sign-ins must match an existing TeamMember — this is the
    // allowlist. Credentials sign-ins already proved themselves in
    // authorize() above, so they pass straight through.
    async signIn({ user, account }) {
      if (account?.provider === "credentials") return true;
      if (!user.email) return false;
      const member = await prisma.teamMember.findUnique({ where: { email: user.email.toLowerCase() } });
      return !!member;
    },
    // JWT stays minimal — identity only. Role and permissions are looked up
    // fresh from the database on every request (see lib/auth.ts), so an
    // admin's permission change takes effect immediately.
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
