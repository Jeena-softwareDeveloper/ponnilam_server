import { PrismaClient } from '@prisma/client';
import { nextTrnNumber } from '../src/utils/sequence.utils';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting to fix Sathiyamangalam transaction numbers...');

  const branchCode = process.argv[2] || 'BR001';
  const branch = await prisma.branch.findUnique({ where: { code: branchCode } });
  
  if (!branch) {
    console.error(`Branch ${branchCode} not found!`);
    return;
  }

  // Find collections in this branch that don't start with 'TRN'
  const collections = await prisma.collection.findMany({
    where: {
      loan: { customer: { area: { branchId: branch.id } } },
      NOT: { trnNumber: { startsWith: 'TRN' } }
    },
    orderBy: { trnDate: 'asc' }
  });

  console.log(`Found ${collections.length} collections with invalid TRN format in branch ${branchCode}`);

  let updated = 0;
  for (const collection of collections) {
    try {
      await prisma.$transaction(async (tx) => {
        const newTrn = await nextTrnNumber(tx);
        await tx.collection.update({
          where: { id: collection.id },
          data: { trnNumber: newTrn }
        });
      });
      updated++;
    } catch (err: any) {
      console.error(`Failed to update collection ${collection.trnNumber}:`, err.message);
    }
  }

  console.log(`Successfully updated ${updated} transaction numbers!`);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
