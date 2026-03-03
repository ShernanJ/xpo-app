import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email.toLowerCase();

        // 1. Find user by email
        let user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          // Auto-register mock for MVP
          const hashedPassword = await bcrypt.hash(credentials.password, 10);
          user = await prisma.user.create({
            data: {
              email,
              password: hashedPassword,
            },
          });
          return user as any;
        }

        // 2. Verify password
        if (!user.password) return null;

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) return null;

        return user as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.activeXHandle = user.activeXHandle;
      }
      if (trigger === "update" && token.id) {
        // When session.update() is called from the client, fetch the freshest User state from Prisma.
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { activeXHandle: true, handle: true },
        });
        if (dbUser) {
          token.activeXHandle = dbUser.activeXHandle ?? undefined;
          token.handle = dbUser.handle ?? undefined;
        }

        // Allow explicit string overwrites passing from `update({ activeXHandle: 'test' })`
        if (session?.activeXHandle !== undefined) {
          token.activeXHandle = session.activeXHandle;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.handle = token.handle as string | undefined;
        session.user.activeXHandle = token.activeXHandle as string | undefined;
      }
      return session;
    },
  },
};
