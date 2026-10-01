import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { ScheduleStatus } from '../src/utils/prisma-enums';

const prisma = new PrismaClient();

async function main() {
  console.log('--- REVERTING EMI 5 (16/09/2026) & EMI 6 (23/09/2026) FOR KAYALVIZHI CENTER ---');

  // Find center
  const center = await prisma.center.findFirst({
    where: {
      OR: [
        { name: { contains: 'KAYALVIZHI' } },
        { code: 'SAT055' },
        { shortCode: 'KTH' }
      ]
    },
    include: {
      customers: {
        include: {
          loans: {
            include: {
              schedules: {
                orderBy: { dueDate: 'asc' }
              }
            }
          }
        }
      }
    }
  });

  if (!center) {
    console.error('Center KAYALVIZHI THIMMAYANPUDHUR not found!');
    return;
  }

  console.log(`Center Found: ${center.name} (Code: ${center.code}, ShortCode: ${center.shortCode})`);
  console.log(`Customers: ${center.customers.length}`);

  const targetLoanIds: string[] = [];
  for (const c of center.customers) {
    for (const l of c.loans) {
      targetLoanIds.push(l.id);
    }
  }

  console.log(`Target Loans count: ${targetLoanIds.length}`);

  await prisma.$transaction(async (tx) => {
    // 1. Void any collections on or after 2026-09-16
    const voidedColl = await tx.collection.updateMany({
      where: {
        loanId: { in: targetLoanIds },
        isVoided: false,
        OR: [
          { trnDate: { gte: new Date('2026-09-16T00:00:00.000Z') } },
          { collectionDay: { gte: '2026-09-16' } }
        ]
      },
      data: {
        isVoided: true,
        voidedAt: new Date(),
        voidReason: 'Reverted by Admin: Today EMI marked prematurely for Kayalvizhi center'
      }
    });
    console.log(`Voided collections count: ${voidedColl.count}`);

    // 2. Revert schedules with dueDate >= 2026-09-16
    const revertedSchedules = await tx.loanSchedule.updateMany({
      where: {
        loanId: { in: targetLoanIds },
        status: ScheduleStatus.PAID,
        dueDate: { gte: new Date('2026-09-16T00:00:00.000Z') }
      },
      data: {
        status: ScheduleStatus.PENDING,
        amountPaid: 0,
        paidDate: null,
        collectionId: null
      }
    });
    console.log(`Reverted schedules count: ${revertedSchedules.count}`);

    // 3. Recalculate loan totals
    for (const loanId of targetLoanIds) {
      const schedules = await tx.loanSchedule.findMany({
        where: { loanId },
        orderBy: { dueDate: 'asc' }
      });

      const totalPaid = schedules.reduce((sum, s) => sum + (s.amountPaid || 0), 0);
      const loan = await tx.loan.findUnique({ where: { id: loanId } });
      if (!loan) continue;

      const newOutstanding = Math.max(0, loan.totalDueAmount - totalPaid);

      await tx.loan.update({
        where: { id: loanId },
        data: {
          outstandingAmount: newOutstanding,
          advanceBalance: 0,
          status: 'ACTIVE'
        }
      });

      const paidCount = schedules.filter(s => s.status === ScheduleStatus.PAID).length;
      console.log(`Loan ${loan.loanNumber}: Outstanding = ₹${newOutstanding} | Paid EMIs = ${paidCount} | Pending = ${schedules.length - paidCount}`);
    }
  });

  console.log('\n--- COMPLETED SUCCESSFULLY ---');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
