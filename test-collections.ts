import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.collection.count().then(console.log).finally(() => prisma.$disconnect());
