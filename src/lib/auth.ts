// CHANGED: Auth.js configuration with Google OAuth and Prisma adapter
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Request offline access for refresh tokens + calendar + gmail scopes
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/calendar.readonly",
            "https://www.googleapis.com/auth/gmail.readonly",
          ].join(" "),
          access_type: "offline",
          prompt: "consent", // Force consent to get refresh token (needed when scopes change)
        },
      },
      // Allow linking OAuth account to existing user with same email
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  // Update existing account on re-auth instead of creating duplicates
  events: {
    async linkAccount({ user, account }) {
      // Delete any older accounts for this user/provider to avoid duplicates
      // The adapter will create the new one with updated scopes
      await prisma.account.deleteMany({
        where: {
          userId: user.id,
          provider: account.provider,
          NOT: {
            providerAccountId: account.providerAccountId,
          },
        },
      });
    },
  },
  callbacks: {
    // CHANGED: Include user ID in session for database queries
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
  // CHANGED: Enable debug mode in development
  debug: process.env.NODE_ENV === "development",
});

// CHANGED: Type augmentation to include user ID in session
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
