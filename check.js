const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'RevenueRecord'
      AND column_name = 'revenueDate'
  `);

  console.log(result);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());