import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { processLoanCollection } from '../src/utils/collection.utils';

const prisma = new PrismaClient();

async function syncSathiCollections() {
  console.log("Starting Sathi Collections Sync from MDB...");

  // 1. Read MDB dump
  const dataPath = path.join(__dirname, '../mdb-full-data.json');
  if (!fs.existsSync(dataPath)) {
    throw new Error('mdb-full-data.json not found!');
  }
  const mdbData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const receipts = mdbData.TrnChit_Receipt2 || [];
  
  console.log(`Found ${receipts.length} total receipts in MDB dump.`);

  // 2. Fetch all Sathi active/closed loans
  const sathiLoans = await prisma.loan.findMany({
    where: { loanNumber: { startsWith: 'SAT' } },
    include: { schedules: true }
  });

  console.log(`Found ${sathiLoans.length} Sathi loans in Postgres.`);

  let totalCollectionsCreated = 0;
  let totalAmountCollected = 0;

  for (const loan of sathiLoans) {
    // Parse loanNumber, e.g. SAT51-L001
    const match = loan.loanNumber.match(/^SAT(\d+)-L(\d+)$/);
    if (!match) {
      console.warn(`Could not parse ChitGroup/Member from ${loan.loanNumber}, skipping.`);
      continue;
    }

    const chitGroup = parseInt(match[1], 10);
    const memberCode = parseInt(match[2], 10);

    // Find valid receipts
    const loanReceipts = receipts.filter((r: any) => 
      r.ChitGroup_Code === chitGroup && 
      r.Member_Code === memberCode && 
      !r.Cancelled &&
      r.Amount > 0
    );

    // Sort chronologically
    loanReceipts.sort((a: any, b: any) => new Date(a.Trn_Dt).getTime() - new Date(b.Trn_Dt).getTime());

    if (loanReceipts.length === 0) continue;

    console.log(`Processing ${loanReceipts.length} historical receipts for ${loan.loanNumber}...`);

    for (const receipt of loanReceipts) {
      const amount = Number(receipt.Amount);
      const trnDate = new Date(receipt.Trn_Dt);
      // Optional: Ensure it's treated as a valid time if necessary, but Trn_Dt is usually 00:00:00Z
      
      try {
        await prisma.$transaction(async (tx) => {
          await processLoanCollection(tx as any, {
            loanId: loan.id,
            amount: amount,
            trnDate: trnDate,
            staffId: loan.staffId,
            remarks: `Legacy Receipt: ${receipt.Trn_No}`,
            isAdmin: true,
          });
        });
        totalCollectionsCreated++;
        totalAmountCollected += amount;
      } catch (err: any) {
        if (err.message?.includes('Amount must be greater than zero') || err.message?.includes('No pending schedules found') || err.message?.includes('Exceeds outstanding amount')) {
          console.warn(`  - Skipped receipt ${receipt.Trn_No} for ${loan.loanNumber}: ${err.message}`);
        } else {
          console.error(`  - Error processing receipt ${receipt.Trn_No} for ${loan.loanNumber}: ${err.message}`);
        }
      }
    }
  }

  console.log("\n==================================");
  console.log(`Sync Complete!`);
  console.log(`Total Historical Collections Inserted: ${totalCollectionsCreated}`);
  console.log(`Total Amount Collected: ₹${totalAmountCollected}`);
  console.log("==================================");
}

syncSathiCollections()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
