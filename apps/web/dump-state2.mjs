import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  await pool.query(`DELETE FROM x_web_scrape_state WHERE id = 'global'`);
  console.log("Deleted global scrape state.");
}

main().catch(console.error).finally(() => pool.end());
