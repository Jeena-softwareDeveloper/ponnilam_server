import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * 01-BranchSeed.ts
 * Creates: Tamil Nadu state, Erode district, Sathiyamangalam branch
 * Source:  SubCompany table — Comp_ID=1, Division=SATHY
 * Run:     npx ts-node scripts/seed/01-BranchSeed.ts
 */
async function main() {
  console.log('[BranchSeed] Starting...');

  const state = await prisma.state.upsert({
    where: { name: 'Tamil Nadu' },
    update: {},
    create: { name: 'Tamil Nadu' },
  });

  const district = await prisma.district.upsert({
    where: { name_stateId: { name: 'Erode', stateId: state.id } },
    update: {},
    create: { name: 'Erode', stateId: state.id },
  });

  const branch = await prisma.branch.upsert({
    where: { code: 'SATHI' },
    update: {},
    create: {
      name:     'Sathiyamangalam',
      code:     'SATHI',
      location: '13/04, VSB Nest, Sri Venugopalasamy Temple Street, Sathyamangalam - 638 401.',
      phone:    '9944533403',
      stateId:    state.id,
      districtId: district.id,
    },
  });

  console.log('[BranchSeed] ✅ Done');
  console.log('  State    id:', state.id);
  console.log('  District id:', district.id);
  console.log('  Branch   id:', branch.id, '  ← use this in subsequent seeds');
}

main().catch(console.error).finally(() => prisma.$disconnect());
