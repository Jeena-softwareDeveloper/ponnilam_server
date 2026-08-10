import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const branchCode = process.argv[2] || 'BR001';
  console.log(`Starting to sync schedules from collections for branch: ${branchCode}`);
  
  const branch = await prisma.branch.findUnique({ where: { code: branchCode } });
  if (!branch) {
    console.error(`Branch ${branchCode} not found!`);
    return;
  }

  const loans = await prisma.loan.findMany({
    where: { customer: { area: { branchId: branch.id } } },
    include: {
      schedules: { orderBy: { dueDate: 'asc' } },
      collections: true,
    }
  });

  console.log(`Found ${loans.length} loans in branch ${branchCode}`);
  
  let synced = 0;
  for (const loan of loans) {
    const totalCollected = loan.collections.reduce((sum, c) => sum + Number(c.amount), 0);
    
    // We need to re-distribute totalCollected across the schedules
    let remaining = totalCollected;
    
    // Check if schedules need updating
    let needsUpdate = false;
    const updates: any[] = [];
    
    for (const sch of loan.schedules) {
      let expectedStatus = 'PENDING';
      let expectedPaid = 0;
      
      if (remaining >= Number(sch.emiAmount)) {
        expectedStatus = 'PAID';
        expectedPaid = Number(sch.emiAmount);
        remaining -= Number(sch.emiAmount);
      } else if (remaining > 0) {
        expectedStatus = 'PARTIAL';
        expectedPaid = remaining;
        remaining = 0;
      }
      
      if (sch.status !== expectedStatus || Number(sch.amountPaid) !== expectedPaid) {
        needsUpdate = true;
        updates.push({
          id: sch.id,
          status: expectedStatus,
          amountPaid: expectedPaid
        });
      }
    }
    
    if (needsUpdate) {
      await prisma.$transaction(async (tx) => {
        for (const u of updates) {
          await tx.loanSchedule.update({
            where: { id: u.id },
            data: { status: u.status, amountPaid: u.amountPaid }
          });
        }
      });
      synced++;
    }
  }

  console.log(`Successfully synced schedules for ${synced} loans.`);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
