import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.loan.findMany({ select: { id: true, loanNumber: true, customerId: true, amount: true } }).then(console.log).finally(() => prisma.$disconnect());
