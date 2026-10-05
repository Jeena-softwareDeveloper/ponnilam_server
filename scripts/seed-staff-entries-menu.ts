import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Staff Entries Menu...');

  const staffEntriesMenu = await prisma.menu.upsert({
    where: { name: 'Staff Entries' },
    update: { path: '/admin/collections/staff-entries', icon: 'UserCheck' },
    create: { name: 'Staff Entries', path: '/admin/collections/staff-entries', icon: 'UserCheck' },
  });

  console.log('Menu created/updated:', staffEntriesMenu.id);

  // Assign to all branches
  const branches = await prisma.branch.findMany();
  for (const b of branches) {
    await prisma.branchMenu.upsert({
      where: { branchId_menuId: { branchId: b.id, menuId: staffEntriesMenu.id } },
      create: {
        branchId: b.id,
        menuId: staffEntriesMenu.id,
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
      },
      update: {
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
      },
    });
  }

  // Assign to all staff
  const staffs = await prisma.staff.findMany();
  for (const s of staffs) {
    await prisma.staffMenu.upsert({
      where: { staffId_menuId: { staffId: s.id, menuId: staffEntriesMenu.id } },
      create: {
        staffId: s.id,
        menuId: staffEntriesMenu.id,
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
      },
      update: {
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
      },
    });
  }

  console.log(`✅ Assigned Staff Entries menu to ${branches.length} branches and ${staffs.length} staffs.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
