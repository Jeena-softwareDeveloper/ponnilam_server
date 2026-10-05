const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const center2 = await prisma.center.findUnique({
    where: { id: 'aa603bbf-7419-4100-b043-35afce7582b4' }
  });
  console.log('Center 2nd loan:', center2?.name);

  const customers = await prisma.customer.findMany({
    where: { customerNo: { in: ['ANT001', 'ANT002', 'ANT003', 'ANT004'] } },
    include: { loans: true }
  });

  const staff = await prisma.staff.findFirst();

  for (const c of customers) {
    const loanNo = c.customerNo.replace('ANT', 'ANT02-L');
    let loan = await prisma.loan.findUnique({
      where: { loanNumber: loanNo }
    });

    if (!loan) {
      console.log('Creating 2nd loan for', c.customerNo, loanNo);
      loan = await prisma.loan.create({
        data: {
          loanNumber: loanNo,
          amount: 10000,
          interestRate: 30,
          status: 'CLOSED',
          remarks: '2nd Loan completed and closed',
          noOfDues: 20,
          perDueAmount: 650,
          totalDueAmount: 13000,
          netDisbursement: 10000,
          outstandingAmount: 0,
          packageId: '24dcd150-8ff8-428f-91c9-1584614c3d59',
          salary: 15000,
          totalIncome: 15000,
          totalExpense: 7000,
          eligibleEmi: 2000,
          customerId: c.id,
          centerId: center2.id,
          staffId: staff.id,
          createdAt: new Date('2026-07-01'),
          sanctionDate: new Date('2026-07-01'),
          disbursementDate: new Date('2026-07-01'),
          firstDueDate: new Date('2026-07-08'),
        }
      });
    }

    // Check schedules
    const existingSched = await prisma.loanSchedule.count({ where: { loanId: loan.id } });
    if (existingSched === 0) {
      for (let i = 1; i <= 20; i++) {
        const dueDate = new Date('2026-07-08');
        dueDate.setDate(dueDate.getDate() + (i - 1) * 7);
        await prisma.loanSchedule.create({
          data: {
            loanId: loan.id,
            dueDate,
            emiAmount: 650,
            amountPaid: 650,
            status: 'PAID',
            paidDate: dueDate,
          }
        });
      }
    }

    // Check collection
    const existingCol = await prisma.collection.findFirst({ where: { loanId: loan.id } });
    if (!existingCol) {
      await prisma.collection.create({
        data: {
          loanId: loan.id,
          trnNumber: 'TRN-' + loanNo + '-01',
          trnDate: new Date('2026-09-30'),
          collectionDay: '2026-09-30',
          amount: 13000,
          staffId: staff.id,
          remarks: '2nd Loan Full Repayment Completed'
        }
      });
    }

    console.log('Successfully configured 2nd loan for', c.customerNo);
  }
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
