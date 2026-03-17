import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 建立預設門市清單（依提供的 POSA/POSB 對照）
  const { STORES } = await import("./stores.data");
  for (const s of STORES) {
    const store = await prisma.store.upsert({
      where: { name: s.name },
      update: {},
      create: { name: s.name },
    });
    for (const code of s.codes) {
      await prisma.storeAlias.upsert({
        where: { code },
        update: { storeId: store.id },
        create: { code, storeId: store.id },
      });
    }
  }

  const emp1 = await prisma.employee.upsert({
    where: { employeeCode: "E001" },
    update: {},
    create: {
      employeeCode: "E001",
      name: "王小明",
      defaultStoreId: null,
      position: "店員",
    },
  });
  const emp2 = await prisma.employee.upsert({
    where: { employeeCode: "E002" },
    update: {},
    create: {
      employeeCode: "E002",
      name: "李小華",
      defaultStoreId: null,
      position: "店員",
    },
  });
  const emp3 = await prisma.employee.upsert({
    where: { employeeCode: "E003" },
    update: {},
    create: {
      employeeCode: "E003",
      name: "陳小美",
      defaultStoreId: null,
      position: "店員",
    },
  });

  const existing = await prisma.performanceTargetSetting.findFirst({
    where: { isActive: true },
  });
  if (!existing) {
    await prisma.performanceTargetSetting.create({
      data: {
        targetValue: 4500,
        effectiveStartDate: new Date("2025-01-01"),
        effectiveEndDate: null,
        isActive: true,
      },
    });
  }

  console.log("Seed 完成：門市清單、員工 E001/E002/E003、目標值 4500");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
