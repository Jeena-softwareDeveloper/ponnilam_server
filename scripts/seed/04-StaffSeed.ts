import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

import * as bcrypt from 'bcryptjs';

/**
 * 04-StaffSeed.ts
 * Creates field agents from MasAgent (9 agents).
 * Uses 'Collection Staff' role — existing in VPS DB.
 *
 * ✅ Safe to run even if staff already exist — checks by phone before creating.
 * Branch: SATHYAMANGALAM (BR001) — ID from VPS DB
 * Run: npx ts-node scripts/seed/04-StaffSeed.ts
 */

// ✅ SATHYAMANGALAM branch ID — from VPS DB
const BRANCH_ID = 'b2a0f0a4-1a87-4ce8-8719-a30ac5fe01b3';

// Role name as it exists in VPS DB (Admin, Manager, Cashier, Collection Staff)
const ROLE_NAME = 'Collection Staff';

const AGENTS = [
  { code: 1,  staffNo: 'STF0001', name: 'RAVICHANDRAN MUTHUSAMY', phone: '9944533403' },
  { code: 2,  staffNo: 'STF0002', name: 'LOGANATHAN N',           phone: '6383352231' },
  { code: 3,  staffNo: 'STF0003', name: 'GK MARIMUTHU',           phone: '7448889797' },
  { code: 4,  staffNo: 'STF0004', name: 'GANESH RAJA C',          phone: '6381194463' },
  { code: 5,  staffNo: 'STF0005', name: 'SARANYA DEVI G',         phone: '9080359113' },
  { code: 7,  staffNo: 'STF0007', name: 'PALLAVI R',              phone: '7200473403' },
  { code: 8,  staffNo: 'STF0008', name: 'TEJA',                   phone: '8838587317' },
  { code: 9,  staffNo: 'STF0009', name: 'PREMKUMAR S',            phone: '7708696683' },
  { code: 10, staffNo: 'STF0010', name: 'HARISHKUMAR J',          phone: '8610319103' },
];

async function main() {
  console.log('[StaffSeed] Starting...');
  console.log('  Branch ID:', BRANCH_ID);

  // Find the role — must already exist in DB
  const role = await prisma.role.findUnique({ where: { name: ROLE_NAME } });
  if (!role) {
    throw new Error(`Role '${ROLE_NAME}' not found in DB. Run 03-RoleSeed.ts first.`);
  }
  console.log(`  Using role: ${role.name} (${role.id})`);

  const hashedPwd = await bcrypt.hash('Password@123', 10);
  let created = 0, skipped = 0;

  for (const agent of AGENTS) {
    const existing = await prisma.staff.findUnique({ where: { phone: agent.phone } });

    if (existing) {
      // Already exists — skip, just log
      console.log(`  [EXISTS]   Staff [${agent.code}]: ${existing.name} — ${existing.id}`);
      skipped++;
    } else {
      const staff = await prisma.staff.create({
        data: {
          staffNo:            agent.staffNo,
          name:               agent.name,
          phone:              agent.phone,
          password:           hashedPwd,
          branchId:           BRANCH_ID,
          roleId:             role.id,
          mustChangePassword: true,
          isActive:           true,
        },
      });
      console.log(`  [CREATED]  Staff [${agent.code}]: ${staff.name} — ${staff.id}`);
      created++;
    }
  }

  console.log(`[StaffSeed] ✅ Done — ${created} created, ${skipped} already existed`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
