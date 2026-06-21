const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixNaNLoans() {
  const badLoans = await prisma.loan.findMany({
    where: { loanNumber: { contains: 'NaN' } },
    include: { customer: { include: { area: true } } }
  });

  if (badLoans.length === 0) {
    console.log("No NaN loans found.");
    return;
  }

  console.log(`Found ${badLoans.length} NaN loans. Fixing...`);
  
  for (const loan of badLoans) {
    let prefix = 'L';
    if (loan.customer?.area?.branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: loan.customer.area.branchId } });
      if (branch?.name) {
        prefix = branch.name.trim().replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() + '-';
      }
    }
    
    // Find the max proper loan number for this prefix
    const maxLoan = await prisma.loan.findFirst({
      where: { 
        loanNumber: { startsWith: prefix, not: { contains: 'NaN' } }
      },
      orderBy: { loanNumber: 'desc' }
    });

    let newNo = 1;
    if (maxLoan && maxLoan.loanNumber) {
        const match = maxLoan.loanNumber.match(/\d+$/);
        if (match) {
            newNo = parseInt(match[0], 10) + 1;
        }
    }

    const nextStr = newNo.toString().padStart(4, '0');
    const newLoanNumber = `${prefix}L${nextStr}`;
    
    await prisma.loan.update({
      where: { id: loan.id },
      data: { loanNumber: newLoanNumber }
    });
    
    console.log(`Updated loan ${loan.id}: ${loan.loanNumber} -> ${newLoanNumber}`);
  }
}

fixNaNLoans().catch(console.error).finally(() => prisma.$disconnect());
