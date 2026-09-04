import 'dotenv/config';
import prisma from '../src/utils/prisma';

async function renameCenters() {
  console.log('--- Starting Center Renaming ---');

  const centers = await prisma.center.findMany({
    where: {
      name: { contains: 'Loan Import' }
    }
  });

  console.log(`Found ${centers.length} centers containing "Loan Import".`);

  let updatedCount = 0;

  for (const center of centers) {
    const newName = center.name.replace(/Loan Import/g, 'Center - I');
    
    await prisma.center.update({
      where: { id: center.id },
      data: { name: newName }
    });
    
    console.log(`Renamed: "${center.name}" -> "${newName}"`);
    updatedCount++;
  }

  console.log(`\n--- Finished! Successfully renamed ${updatedCount} center(s). ---`);
}

renameCenters()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
