import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * 03-RoleSeed.ts
 * Upserts roles to match existing VPS DB roles.
 * Existing in DB: Admin, Manager, Cashier, Collection Staff
 * Run: npx ts-node scripts/seed/03-RoleSeed.ts
 */

// Matches existing roles in VPS DB — do NOT rename these
const ROLES = ['Admin', 'Manager', 'Cashier', 'Collection Staff'];

async function main() {
  console.log('[RoleSeed] Starting...');
  for (const name of ROLES) {
    const role = await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
    console.log('  Role:', role.name, '|', role.id);
  }
  console.log('[RoleSeed] ✅ Done');
}

main().catch(console.error).finally(() => prisma.$disconnect());
