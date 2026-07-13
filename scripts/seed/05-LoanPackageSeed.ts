import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * 05-LoanPackageSeed.ts
 * Creates loan packages from MasLoanPackage.
 * Source:  MasLoanPackage (1 package)
 * Run: npx ts-node scripts/seed/05-LoanPackageSeed.ts
 */

const LOAN_PACKAGES = [
  {
    code:         1,
    name:         "15K",
    interestRate: 30,
    durationDays: 196,
    frequency:    "WEEKLY",
    noOfDues:     28,
    perDueAmt:    650,
  },
];

async function main() {
  console.log('[LoanPackageSeed] Starting...');

  for (const pkg of LOAN_PACKAGES) {
    const lp = await prisma.loanPackage.upsert({
      where: { name: pkg.name },
      update: { interestRate: pkg.interestRate, durationDays: pkg.durationDays, frequency: pkg.frequency },
      create: {
        name:         pkg.name,
        interestRate: pkg.interestRate,
        durationDays: pkg.durationDays,
        frequency:    pkg.frequency,
      },
    });
    console.log(`  Package: ${lp.name} | ROI: ${lp.interestRate}% | Dues: ${pkg.noOfDues} × ₹${pkg.perDueAmt} | id: ${lp.id}`);
  }

  console.log('[LoanPackageSeed] ✅ Done');
}

main().catch(console.error).finally(() => prisma.$disconnect());
