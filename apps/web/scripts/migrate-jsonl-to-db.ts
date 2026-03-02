import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { PrismaClient, Prisma } from "../lib/generated/prisma/client";
import type { StoredOnboardingRun } from "../lib/onboarding/store";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const cwd = process.cwd();
  const filePaths = [
    path.resolve(cwd, "db", "onboarding-runs.jsonl"),
    path.resolve(cwd, "..", "..", "db", "onboarding-runs.jsonl"),
  ];

  let storePath = null;
  for (const fp of filePaths) {
    if (existsSync(fp)) {
      storePath = fp;
      break;
    }
  }

  if (!storePath) {
    console.log("No onboarding-runs.jsonl file found. Skipping data migration.");
    return;
  }

  console.log(`Found JSONL at ${storePath}, starting migration...`);

  const fileContent = readFileSync(storePath, "utf8");
  const lines = fileContent.split("\n").map(l => l.trim()).filter(Boolean);

  let successCount = 0;
  for (const line of lines) {
    try {
      const run = JSON.parse(line) as StoredOnboardingRun;

      await prisma.onboardingRun.upsert({
        where: { id: run.runId },
        update: {
          input: run.input as unknown as Prisma.InputJsonObject,
          result: run.result as unknown as Prisma.InputJsonObject,
          createdAt: new Date(run.persistedAt),
        },
        create: {
          id: run.runId,
          input: run.input as unknown as Prisma.InputJsonObject,
          result: run.result as unknown as Prisma.InputJsonObject,
          createdAt: new Date(run.persistedAt),
        },
      });
      successCount++;
    } catch (e: unknown) {
      console.error("Failed to migrate record:", line.slice(0, 50), "...", e instanceof Error ? e.message : e);
      // exit early to see the error clearly
      process.exit(1);
    }
  }

  console.log(`Successfully migrated ${successCount}/${lines.length} onboarding runs to Postgres!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
