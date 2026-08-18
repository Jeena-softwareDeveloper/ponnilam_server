import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPwd = await bcrypt.hash('Admin@123', 10);
  
  await prisma.staff.update({
    where: { username: 'admin' },
    data: { password: hashedPwd, isActive: true }
  });

  console.log('Password forcefully reset for admin to Admin@123');
}

main().catch(console.error).finally(() => prisma.$disconnect());
