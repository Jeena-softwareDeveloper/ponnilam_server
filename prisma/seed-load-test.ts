// @ts-nocheck
/**
 * Bulk seed for load / performance testing.
 * Ensures at least TARGET customers exist (default 1000) with active loans.
 *
 * Run: npx ts-node prisma/seed-load-test.ts
 * Env: LOAD_TEST_CUSTOMERS=1000
 */
import { PrismaClient } from '@prisma/client';
import {
  buildScheduleRows,
  computeFlatEmi,
  resolveLastEmiAmount,
} from '../src/utils/loan.utils';
import { LoanStatus } from '../src/utils/prisma-enums';
import { nextCustomerNo } from '../src/utils/sequence.utils';

const TARGET = Math.max(1, parseInt(process.env.LOAD_TEST_CUSTOMERS || '1000', 10) || 1000);
const BATCH = 50;

const prisma = new PrismaClient();

async function main() {
  const start = Date.now();
  const existing = await prisma.customer.count();
  const needed = Math.max(0, TARGET - existing);

  if (needed === 0) {
    console.log(`Already have ${existing} customers (target ${TARGET}). Nothing to seed.`);
    return;
  }

  const centers = await prisma.center.findMany({
    where: { isActive: true },
    include: {
      area: { include: { branch: true } },
      employee: true,
    },
  });

  if (!centers.length) {
    throw new Error('No centers found. Run npm run db:seed first.');
  }

  const loanPackage = await prisma.loanPackage.findFirst({ where: { isActive: true } });
  if (!loanPackage) {
    throw new Error('No active loan package. Run npm run db:seed first.');
  }

  console.log(`Seeding ${needed} customers (existing ${existing}, target ${TARGET})...`);

  let created = 0;
  let centerIdx = 0;
  let loanSerial = existing + 1;

  while (created < needed) {
    const batchSize = Math.min(BATCH, needed - created);
    const center = centers[centerIdx % centers.length];
    centerIdx++;

    const branchId = center.area.branchId;
    const areaId = center.areaId;
    const staffId = center.employeeId || (await prisma.staff.findFirst({ where: { branchId } }))?.id;
    if (!staffId) {
      throw new Error(`No staff for center ${center.name}`);
    }

    const centerCode = center.code || `C${centerIdx}`;

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < batchSize; i++) {
        const n = existing + created + i + 1;
        const customerNo = await nextCustomerNo(tx, branchId);
        const mobile = String(9100000000 + n);

        const customer = await tx.customer.create({
          data: {
            customerNo,
            name: `Load Test Customer ${n}`,
            mobile,
            phone: mobile,
            address: `Load Test Address ${n}`,
            maritalStatus: 'MARRIED',
            residenceType: 'OWNED',
            areaId,
            centerId: center.id,
            employeeId: staffId,
            centerMemberType: 'MEMBER',
            isActive: true,
          },
        });

        const principal = 10000;
        const noOfDues = 20;
        const { perDueAmount, totalDueAmount } = computeFlatEmi(principal, 30, noOfDues);
        const firstDueDate = new Date();
        firstDueDate.setDate(firstDueDate.getDate() - 7);
        const loanNumber = `LT-${centerCode}-${String(loanSerial).padStart(5, '0')}`;
        loanSerial++;

        const loan = await tx.loan.create({
          data: {
            loanNumber,
            customerId: customer.id,
            staffId,
            packageId: loanPackage.id,
            amount: principal,
            interestRate: 30,
            status: LoanStatus.ACTIVE,
            noOfDues,
            perDueAmount,
            totalDueAmount,
            outstandingAmount: totalDueAmount,
            deductionAmount: 0,
            netDisbursement: principal,
            salary: 15000,
            totalIncome: 15000,
            totalExpense: 7000,
            eligibleEmi: 2000,
            applicationDate: new Date(),
            sanctionDate: new Date(),
            disbursementDate: new Date(),
            firstDueDate,
          },
        });

        const lastEmi = resolveLastEmiAmount(totalDueAmount, perDueAmount, noOfDues);
        const schedules = buildScheduleRows(
          loan.id,
          noOfDues,
          perDueAmount,
          firstDueDate,
          'WEEKLY',
          lastEmi
        );
        await tx.loanSchedule.createMany({ data: schedules });
      }
    });

    created += batchSize;
    console.log(`  ... ${created}/${needed} (${((created / needed) * 100).toFixed(0)}%)`);
  }

  const total = await prisma.customer.count();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Done. ${total} customers in DB. Seeded ${needed} in ${elapsed}s.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
