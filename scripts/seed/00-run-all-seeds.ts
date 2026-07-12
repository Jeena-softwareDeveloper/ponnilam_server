import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * 00-run-all-seeds.ts
 * Runs all seed scripts in order for Sathiyamangalam branch.
 *
 * Usage: npx ts-node scripts/seed/00-run-all-seeds.ts
 */

import { main as seedBranch }      from './01-BranchSeed';
import { main as seedAreas }        from './02-AreaSeed';
import { main as seedRoles }        from './03-RoleSeed';
import { main as seedStaff }        from './04-StaffSeed';
import { main as seedLoanPackages } from './05-LoanPackageSeed';
import { main as seedCenters }      from './06-CenterSeed';
import { main as seedGroups }       from './07-GroupSeed';
import { main as seedCustomers }    from './08-CustomerSeed';
import { main as seedLoans }        from './09-LoanSeed';
import { main as seedCollections }  from './10-CollectionSeed';

async function runAll() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  PONNILAM FIN CORP — Full Seed Runner        ║');
  console.log('╚══════════════════════════════════════════════╝');
  await seedBranch();
  await seedAreas();
  await seedRoles();
  await seedStaff();
  await seedLoanPackages();
  await seedCenters();
  await seedGroups();
  await seedCustomers();
  await seedLoans();
  await seedCollections();

  const [a,ce,s,cu,l,co] = await Promise.all([
    prisma.area.count(), prisma.center.count(), prisma.staff.count(),
    prisma.customer.count(), prisma.loan.count(), prisma.collection.count(),
  ]);
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  FINAL SEED REPORT                           ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`  Areas:       ${a}`);
  console.log(`  Centers:     ${ce}`);
  console.log(`  Staff:       ${s}`);
  console.log(`  Customers:   ${cu}`);
  console.log(`  Loans:       ${l}`);
  console.log(`  Collections: ${co}`);
  console.log('\n  ✅ All seeds complete!');

  await prisma.$disconnect();
}

runAll().catch(console.error);
