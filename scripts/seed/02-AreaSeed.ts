import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * 02-AreaSeed.ts
 * Creates all Areas under the Sathiyamangalam branch.
 * Source:  MasArea table (3 rows) + center-specific areas from MasChitGroup
 * Total unique areas: 50
 *
 * Branch: SATHYAMANGALAM (BR001) — ID taken directly from VPS PostgreSQL DB
 * Run: npx ts-node scripts/seed/02-AreaSeed.ts
 */

// ✅ SATHYAMANGALAM branch ID — from VPS DB
const BRANCH_ID = 'b2a0f0a4-1a87-4ce8-8719-a30ac5fe01b3';

const AREAS: string[] = [
  "BANNARI ROAD",
  "GOBI ROAD",
  "ATHANI ROAD",
  "IRUGALUR",
  "DASARIPALAYAM",
  "KADATHUR",
  "GANTHIPURAM",
  "UDAYAMARATHU MEDU",
  "PALLIKUDAMPIRIVU",
  "SASTHIRI NAGAR",
  "VADAVALLI",
  "DHOODAMPALAYAM",
  "NAMBIYUR",
  "ANNNANAGAR",
  "SADUMUGAI",
  "RAMAPURAM",
  "GANDHI NAGAR",
  "KULLANAYAKANUR",
  "VARATHAMPALAYAM",
  "VADAKUPETTAI",
  "BASUVAPALAYAM",
  "PASUVAPALAYAM",
  "G.H CENTER",
  "CHIKKARASAMPALAYAM",
  "PUDUPEERKADAVU",
  "JEEVA NAGAR",
  "KASIPALAYAM",
  "M.G.R NAGAR",
  "AYEEPALAYAM",
  "RAJAN NAGAR",
  "SURIYA KATTU KALANI",
  "BAGUTHAMPALAYAM",
  "IKKARAITHATHAPALLI",
  "KOTTUVEERAMPALAYAM",
  "MUDUKKANDURAI",
  "ELLUR MEDU",
  "PINCHAMEDU",
  "KARPURAKKADU",
  "PERIYAKODIVERI",
  "KUTTAI METTUR",
  "KOLINJANUR",
  "KOLLUMETTU COLONY",
  "KARATTUPALAYAM",
  "IKKARAINEGAMAM",
  "THATTAMPUDHUR",
  "ARIYAPPAMPALAYAM",
  "UTHANDIYUR",
  "THATTAMPUDUR",
  "DHODDAMPALAYAM",
  "UPPUPALLAM",
];

async function main() {
  console.log('[AreaSeed] Starting...');
  console.log('  Branch ID:', BRANCH_ID);

  let count = 0;
  for (const name of AREAS) {
    await prisma.area.upsert({
      where: { branchId_name: { branchId: BRANCH_ID, name } },
      update: {},
      create: { name, branchId: BRANCH_ID },
    });
    count++;
    console.log('  Area:', name);
  }

  console.log(`[AreaSeed] ✅ Done — ${count} areas seeded under branch: ${BRANCH_ID}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
