/**
 * Backfill nullable fields before applying stricter schema constraints.
 * Run: npx ts-node prisma/backfill-required-fields.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Backfilling required fields...');

  const defaultRole =
    (await prisma.role.findFirst({ where: { name: 'Staff' } })) ||
    (await prisma.role.findFirst());

  if (!defaultRole) {
    console.warn('No roles found — run seed first.');
    return;
  }

  const defaultState =
    (await prisma.state.findFirst({ where: { isActive: true } })) ||
    (await prisma.state.findFirst());
  const defaultDistrict = defaultState
    ? await prisma.district.findFirst({ where: { stateId: defaultState.id } })
    : null;

  // Branch: stateId + districtId
  const branches = await prisma.branch.findMany();
  for (const branch of branches) {
    const updates: Record<string, string> = {};
    if (!branch.stateId && defaultState) updates.stateId = defaultState.id;
    if (!branch.districtId && defaultDistrict) updates.districtId = defaultDistrict.id;
    if (Object.keys(updates).length > 0) {
      await prisma.branch.update({ where: { id: branch.id }, data: updates });
      console.log(`  Branch ${branch.code}: filled state/district`);
    }
  }

  // Staff: roleId
  for (const s of await prisma.staff.findMany()) {
    if (!s.roleId && defaultRole) {
      await prisma.staff.update({ where: { id: s.id }, data: { roleId: defaultRole.id } });
      console.log(`  Staff ${s.name}: assigned default role`);
    }
  }

  // Customer: areaId + mobile
  const customers = await prisma.customer.findMany({
    include: { center: { include: { area: true } } },
  });
  for (const c of customers) {
    const updates: Record<string, string> = {};
    if (!c.areaId && c.center?.areaId) updates.areaId = c.center.areaId;
    if (!c.mobile) updates.mobile = c.phone || '0000000000';
    if (Object.keys(updates).length > 0) {
      await prisma.customer.update({ where: { id: c.id }, data: updates });
      console.log(`  Customer ${c.customerNo}: filled area/mobile`);
    }
  }

  // Collection: staffId from loan.staffId
  for (const col of await prisma.collection.findMany({ include: { loan: true } })) {
    if (!col.staffId && col.loan?.staffId) {
      await prisma.collection.update({
        where: { id: col.id },
        data: { staffId: col.loan.staffId },
      });
      console.log(`  Collection ${col.trnNumber}: assigned staff from loan`);
    }
  }

  // Loan: packageId — skip if no packages
  const defaultPackage = await prisma.loanPackage.findFirst({ where: { isActive: true } });
  if (defaultPackage) {
    for (const loan of await prisma.loan.findMany()) {
      if (!loan.packageId) {
        await prisma.loan.update({
          where: { id: loan.id },
          data: { packageId: defaultPackage.id },
        });
        console.log(`  Loan ${loan.loanNumber}: assigned default package`);
      }
    }
  }

  // Notification: referenceId -> staffId (legacy column, pre-migration)
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; referenceId: string | null }>>(
      `SELECT id, referenceId FROM Notification WHERE referenceId IS NOT NULL AND (staffId IS NULL OR staffId = '')`
    );
    for (const row of rows) {
      if (row.referenceId) {
        await prisma.$executeRawUnsafe(
          `UPDATE Notification SET staffId = ? WHERE id = ?`,
          row.referenceId,
          row.id
        );
        console.log(`  Notification ${row.id}: migrated referenceId -> staffId`);
      }
    }
  } catch {
    // referenceId column may already be removed
  }

  console.log('Backfill complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
