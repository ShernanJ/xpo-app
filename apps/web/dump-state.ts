import { prisma } from "./lib/db.js";

async function main() {
  const result = await prisma.$queryRawUnsafe('SELECT state FROM x_web_scrape_state WHERE id = \'global\' LIMIT 1');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
