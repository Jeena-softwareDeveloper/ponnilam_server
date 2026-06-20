const ADODB = require('node-adodb');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const connection = ADODB.open('Provider=Microsoft.Jet.OLEDB.4.0;Data Source=D:\\access\\SS\\server\\MAGALIRKULU2.MDB;Jet OLEDB:Database Password=abcsSm;');

async function updateOutstanding() {
  console.log("Updating Outstanding Amounts...");
  const loans = await connection.query('SELECT * FROM [MasMemberChitGroupLink]');
  
  let updatedCount = 0;
  for (const l of loans) {
    const loanNumber = `LOAN${l.Ac_Code}-${l.ChitGroup_Code}`;
    const totalDue = parseFloat(l.DueAmount || 0);
    const paid = parseFloat(l.DueAmountRecd || 0);
    const outstanding = totalDue - paid;

    await prisma.loan.updateMany({
      where: { loanNumber: loanNumber },
      data: {
        outstandingAmount: outstanding
      }
    });
    updatedCount++;
  }
  
  console.log(`Successfully updated ${updatedCount} loans with outstanding amount!`);
}

updateOutstanding()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
