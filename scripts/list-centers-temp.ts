import 'dotenv/config';
import prisma from '../src/utils/prisma';
async function main() {
  const centers = await prisma.center.findMany({ select: { name: true, code: true }, orderBy: { name: 'asc' } });
  centers.forEach((c: any) => console.log(c.code + ' | ' + c.name));
}
main().then(() => prisma.$disconnect());
