import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const role = await prisma.role.findUnique({ where: { name: 'Admin' } });
  if (!role) {
    console.error('Admin role not found');
    return;
  }

  const hashedPwd = await bcrypt.hash('Admin@123', 10);
  
  await prisma.staff.upsert({
    where: { phone: '9999999999' },
    update: { password: hashedPwd, roleId: role.id, isActive: true },
    create: {
      staffNo: 'ADM0001',
      name: 'Super Admin',
      phone: '9999999999',
      username: 'admin',
      password: hashedPwd,
      roleId: role.id,
      isActive: true,
      mustChangePassword: false,
    },
  });

  console.log('Admin user seeded: admin / Admin@123 (or phone 9999999999)');
}

main().catch(console.error).finally(() => prisma.$disconnect());
