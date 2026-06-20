const ADODB = require('node-adodb');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const connection = ADODB.open('Provider=Microsoft.Jet.OLEDB.4.0;Data Source=D:\\access\\SS\\server\\MAGALIRKULU2.MDB;Jet OLEDB:Database Password=abcsSm;');

async function run() {
  console.log("Migrating Collections from TrnChit_Receipt2...");

  const receipts = await connection.query('SELECT * FROM [TrnChit_Receipt2]');
  console.log(`Found ${receipts.length} receipts.`);

  let successCount = 0;
  let skipCount = 0;

  for (const r of receipts) {
    if (r.Cancelled) {
      skipCount++;
      continue;
    }

    const loanNumber = `LOAN${r.Ac_Code}-${r.ChitGroup_Code}`;
    
    // Find the loan in the database
    const loan = await prisma.loan.findUnique({
      where: { loanNumber: loanNumber },
      include: { customer: true }
    });

    if (!loan) {
      skipCount++;
      continue;
    }

    // Insert into Collection
    let collection;
    try {
      collection = await prisma.collection.upsert({
        where: { trnNumber: String(r.Trn_No) },
        update: {},
        create: {
          trnNumber: String(r.Trn_No),
          trnDate: new Date(r.Trn_Dt),
          amount: parseFloat(r.Amount) || 0,
          remarks: r.Remarks || '',
          loanId: loan.id,
          staffId: loan.staffId
        }
      });
      
      // Insert into CustomerLedger
      await prisma.customerLedger.create({
        data: {
          date: new Date(r.Trn_Dt),
          transactionType: 'Collection',
          amount: parseFloat(r.Amount) || 0,
          openingBalance: 0,
          closingBalance: 0,
          remarks: 'Migrated from Old DB',
          customerId: loan.customerId,
          collectionId: collection.id
        }
      });

      successCount++;
    } catch(err) {
      console.error(`Error processing Trn_No ${r.Trn_No}:`, err.message);
    }
  }

  console.log(`Migration Complete: ${successCount} successful, ${skipCount} skipped.`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
