// CHANGED: Prisma client singleton with LibSQL adapter for Prisma 7.x
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "path";

// Prevent multiple instances during hot reload in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  // CHANGED: Create Prisma adapter with absolute path to SQLite file (in project root)
  const dbPath = path.join(process.cwd(), "dev.db");
  const adapter = new PrismaLibSql({
    url: `file:${dbPath}`,
  });

  // CHANGED: Create Prisma client with adapter
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
