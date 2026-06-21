const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("Staff:", await prisma.staff.findUnique({ where: { id: "5ed02400-52b6-460c-b8a5-bcd4670b5e71" } }));
}

main().catch(console.error).finally(() => prisma.$disconnect());
