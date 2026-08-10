import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cus = await prisma.customer.findFirst({ where: { customerNo: { contains: '382' } } });
  console.log('Customer 382:', cus);
}
main().finally(() => prisma.$disconnect());