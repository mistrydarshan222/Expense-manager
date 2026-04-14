import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set in .env');
  }

  const ping = await prisma.$queryRaw<Array<{ result: number }>>`SELECT 1 AS result`;
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;

  console.log('Database connection: OK');
  console.log(`SELECT 1 result: ${ping[0]?.result ?? 'unknown'}`);

  if (tables.length === 0) {
    console.log('Public tables: none found');
    return;
  }

  console.log('Public tables:');
  for (const table of tables) {
    console.log(`- ${table.table_name}`);
  }
}

main()
  .catch((error) => {
    console.error('Database connection failed.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
