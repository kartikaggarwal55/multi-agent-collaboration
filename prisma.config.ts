// Prisma configuration file for multi-agent collaboration app
// CHANGED: Added for Prisma 7.x configuration
import "dotenv/config";
import path from "path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // SQLite database file in prisma directory
    url: process.env.DATABASE_URL || `file:${path.join(__dirname, "prisma", "dev.db")}`,
  },
});
