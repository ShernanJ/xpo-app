import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is required to verify required database tables.");
  process.exit(1);
}

const REQUIRED_TABLES = [
  "ChatTurnControl",
  "OnboardingBackfillJob",
  "RequestRateLimitBucket",
];

const pool = new Pool({ connectionString });

try {
  const missingTables = [];

  for (const tableName of REQUIRED_TABLES) {
    const result = await pool.query(
      "SELECT to_regclass($1) AS relation_name",
      [`public."${tableName}"`],
    );
    const relationName = result.rows[0]?.relation_name ?? null;
    if (!relationName) {
      missingTables.push(tableName);
    }
  }

  if (missingTables.length > 0) {
    console.error(
      `Missing required database tables: ${missingTables.join(", ")}. Run 'pnpm -C apps/web exec prisma migrate deploy' before starting the app.`,
    );
    process.exit(1);
  }

  console.log(`Verified required database tables: ${REQUIRED_TABLES.join(", ")}`);
} finally {
  await pool.end();
}
