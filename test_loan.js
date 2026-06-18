const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.loan.findUnique({
  where: { id: '13d22be4-6e67-4e79-8f9e-ff127a3e73e1' },
  include: {
    customer: { include: { center: true } },
    staff: true,
    schedules: { orderBy: { dueDate: 'asc' } },
    collections: { orderBy: { trnDate: 'desc' } }
  }
}).then(console.log).catch(console.error).finally(() => prisma.$disconnect());
