// Prisma configuration file for multi-agent collaboration app
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // PostgreSQL connection via Neon
    url: process.env.DATABASE_URL!,
  },
});
