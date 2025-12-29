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
      // CHANGED: Request offline access for refresh tokens + calendar scope
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/calendar.readonly",
          access_type: "offline",
          prompt: "consent", // Force consent to get refresh token
        },
      },
    }),
  ],
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
