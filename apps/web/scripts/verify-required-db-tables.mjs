import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is required to verify required database tables.");
  process.exit(1);
}

const REQUIRED_TABLES = [
  "ChatMediaAsset",
  "ChatTurnControl",
  "ConversationMemory",
  "OnboardingBackfillJob",
  "RequestRateLimitBucket",
];

const REQUIRED_COLUMNS = [
  {
    tableName: "ConversationMemory",
    columnName: "version",
  },
];

const pool = new Pool({ connectionString });

try {
  const missingTables = [];
  const missingColumns = [];

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

  for (const requirement of REQUIRED_COLUMNS) {
    const result = await pool.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
        LIMIT 1
      `,
      [requirement.tableName, requirement.columnName],
    );
    if (result.rowCount === 0) {
      missingColumns.push(`${requirement.tableName}.${requirement.columnName}`);
    }
  }

  if (missingTables.length > 0 || missingColumns.length > 0) {
    const missingParts = [
      missingTables.length > 0
        ? `tables: ${missingTables.join(", ")}`
        : null,
      missingColumns.length > 0
        ? `columns: ${missingColumns.join(", ")}`
        : null,
    ].filter(Boolean);
    console.error(
      `Missing required database schema: ${missingParts.join("; ")}. Run 'pnpm -C apps/web exec prisma migrate deploy' before starting the app.`,
    );
    process.exit(1);
  }

  console.log(
    `Verified required database schema: tables ${REQUIRED_TABLES.join(", ")}; columns ${REQUIRED_COLUMNS.map((requirement) => `${requirement.tableName}.${requirement.columnName}`).join(", ")}`,
  );
} finally {
  await pool.end();
}
