import { PrismaClient } from '@prisma/client';
import { generateCenterCodeInTx } from '../src/utils/center-code.utils';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting to fix Sathiyamangalam center codes...');

  const branchCode = process.argv[2] || 'BR001';
  const branch = await prisma.branch.findUnique({ where: { code: branchCode } });
  
  if (!branch) {
    console.error(`Branch ${branchCode} not found!`);
    return;
  }

  // Find centers in this branch that start with 'CTR' (the old seed fallback)
  const centers = await prisma.center.findMany({
    where: {
      area: { branchId: branch.id },
      code: { startsWith: 'CTR' }
    },
    include: {
      groups: true
    },
    orderBy: { createdAt: 'asc' }
  });

  console.log(`Found ${centers.length} centers with 'CTR' prefix in branch ${branchCode}`);

  let updated = 0;
  for (const center of centers) {
    try {
      await prisma.$transaction(async (tx) => {
        // Generate new branch-specific code (e.g. SAT001)
        const newCode = await generateCenterCodeInTx(tx, branch.code, branch.id, branch.name);
        
        await tx.center.update({
          where: { id: center.id },
          data: { code: newCode }
        });

        // Also update groups under this center (e.g. SAT001-G1)
        const groupCodePrefix = newCode.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
        
        for (let i = 0; i < center.groups.length; i++) {
          const group = center.groups[i];
          const newGroupCode = `${groupCodePrefix}-G${i + 1}`;
          
          await tx.group.update({
            where: { id: group.id },
            data: { groupCode: newGroupCode }
          });
        }
      });
      updated++;
    } catch (err: any) {
      console.error(`Failed to update center ${center.code}:`, err.message);
    }
  }

  console.log(`Successfully updated ${updated} center codes!`);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
