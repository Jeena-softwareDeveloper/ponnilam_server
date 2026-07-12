import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * 07-GroupSeed.ts
 * Creates groups (G1-G5) for every center.
 * Source:  MasPartyGroup (5 groups × 54 centers)
 *
 * IMPORTANT: Run 06-CenterSeed.ts first.
 * Run: npx ts-node scripts/seed/07-GroupSeed.ts
 */

// ✅ SATHYAMANGALAM branch ID — from VPS DB
const BRANCH_ID = 'b2a0f0a4-1a87-4ce8-8719-a30ac5fe01b3';

const PARTY_GROUPS = [
  { code: 1, name: "G1" },
  { code: 2, name: "G2" },
  { code: 3, name: "G3" },
  { code: 4, name: "G4" },
  { code: 5, name: "G5" },
];

async function main() {
  console.log('[GroupSeed] Starting...');
  console.log('  Branch ID:', BRANCH_ID);

  const areas = await prisma.area.findMany({ where: { branchId: BRANCH_ID } });
  const areaIds = areas.map(a => a.id);
  const centers = await prisma.center.findMany({ where: { areaId: { in: areaIds } } });

  let count = 0;
  for (const center of centers) {
    for (const pg of PARTY_GROUPS) {
      await prisma.group.upsert({
        where: { centerId_groupName: { centerId: center.id, groupName: pg.name } },
        update: {},
        create: {
          groupCode: `${center.code}-${pg.name}`,
          groupName: pg.name,
          centerId:  center.id,
        },
      });
      count++;
    }
  }

  console.log(`[GroupSeed] ✅ Done — ${count} groups seeded across ${centers.length} centers`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
