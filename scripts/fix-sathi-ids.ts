import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Starting to fix Sathiyamangalam IDs...');
  
  const branch = await prisma.branch.findUnique({ where: { code: 'BR001' } });
  if (!branch) {
    console.error('Branch BR001 (Sathiyamangalam) not found!');
    return;
  }

  // Fix Customers
  const customers = await prisma.customer.findMany({
    where: {
      area: { branchId: branch.id },
      customerNo: { startsWith: 'CUS' }
    }
  });

  console.log(`Found ${customers.length} customers with CUS... prefix to fix.`);
  let cusFixed = 0;
  for (const cus of customers) {
    // Extract the number from CUS0384 -> 384
    const numMatch = cus.customerNo.match(/\d+/);
    if (numMatch) {
      const numStr = String(parseInt(numMatch[0])).padStart(4, '0');
      const newCustomerNo = `SAT-CUS${numStr}`;
      
      try {
        await prisma.customer.update({
          where: { id: cus.id },
          data: { customerNo: newCustomerNo }
        });
        cusFixed++;
      } catch (err: any) {
        console.error(`Failed to update customer ${cus.customerNo}:`, err.message);
      }
    }
  }
  console.log(`Successfully updated ${cusFixed} customer IDs.`);

  // Fix Loans
  const loans = await prisma.loan.findMany({
    where: {
      customer: { area: { branchId: branch.id } },
      loanNumber: { startsWith: 'LN' }
    }
  });

  console.log(`Found ${loans.length} loans with LN... prefix to fix.`);
  let loansFixed = 0;
  for (const loan of loans) {
    // Extract the number from LN00384 -> 384
    const numMatch = loan.loanNumber.match(/\d+/);
    if (numMatch) {
      const numStr = String(parseInt(numMatch[0])).padStart(4, '0');
      const newLoanNo = `SAT-LO${numStr}`;
      
      try {
        await prisma.loan.update({
          where: { id: loan.id },
          data: { loanNumber: newLoanNo }
        });
        loansFixed++;
      } catch (err: any) {
        console.error(`Failed to update loan ${loan.loanNumber}:`, err.message);
      }
    }
  }
  console.log(`Successfully updated ${loansFixed} loan IDs.`);
  console.log('Finished fixing Sathiyamangalam IDs!');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
