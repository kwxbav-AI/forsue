const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const STORES = [
  { name: "中正", codes: ["A001", "B001"] },
  { name: "義成", codes: ["A002", "B002"] },
  { name: "宜蘭", codes: ["A003", "B003"] },
  { name: "南竹", codes: ["A004", "B004"] },
  { name: "北成", codes: ["A005", "B005"] },
  { name: "女中", codes: ["A006", "B006"] },
  { name: "力行", codes: ["A007", "B007"] },
  { name: "五福", codes: ["A008", "B008"] },
  { name: "中北", codes: ["A009", "B009"] },
  { name: "五結", codes: ["A010", "B010"] },
  { name: "中埔", codes: ["A011", "B011"] },
  { name: "大業", codes: ["A012", "B012"] },
  { name: "中山", codes: ["A013", "B013"] },
  { name: "八德", codes: ["A014", "B014"] },
  { name: "南門", codes: ["A015", "B015"] },
  { name: "大竹", codes: ["A016", "B016"] },
  { name: "內壢", codes: ["A017", "B017"] },
  { name: "礁溪", codes: ["A018", "B018"] },
  { name: "昆明", codes: ["A021", "B021"] },
  { name: "東勇", codes: ["A022", "B022"] },
  { name: "校舍", codes: ["A023", "B023"] },
  { name: "大有", codes: ["A024", "B024"] },
  { name: "嘉興", codes: ["A080", "B080"] },
  { name: "虎林", codes: ["A082", "B082"] },
  { name: "福德", codes: ["A083", "B083"] },
  { name: "萬隆", codes: ["A085", "B085"] },
];

async function main() {
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

  await prisma.employee.upsert({
    where: { employeeCode: "E001" },
    update: {},
    create: { employeeCode: "E001", name: "王小明", defaultStoreId: null, position: "店員" },
  });
  await prisma.employee.upsert({
    where: { employeeCode: "E002" },
    update: {},
    create: { employeeCode: "E002", name: "李小華", defaultStoreId: null, position: "店員" },
  });
  await prisma.employee.upsert({
    where: { employeeCode: "E003" },
    update: {},
    create: { employeeCode: "E003", name: "陳小美", defaultStoreId: null, position: "店員" },
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

  const userCount = await prisma.appUser.count();
  if (userCount === 0) {
    const adminUser = process.env.SEED_ADMIN_USERNAME || "admin";
    const adminPass = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";
    const passwordHash = await bcrypt.hash(adminPass, 10);
    await prisma.appUser.create({
      data: {
        username: adminUser,
        passwordHash,
        role: "ADMIN",
      },
    });
    console.log(
      `Created default admin login: username="${adminUser}" (change password in production)`
    );
  }

  console.log(`Seed done. Stores: ${STORES.length}, employees: 3, target: 4500`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });

