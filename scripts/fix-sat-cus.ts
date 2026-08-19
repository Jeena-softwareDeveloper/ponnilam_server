import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function generateBaseShortCode(name: string): string {
  const cleanName = name.replace(/[^a-zA-Z\s]/g, '').trim();
  const parts = cleanName.split(/\s+/).filter(Boolean);
  let code = '';
  
  if (parts.length >= 3) {
    code = parts[0][0] + parts[1][0] + parts[2][0];
  } else if (parts.length === 2) {
    if (parts[1].length >= 2) {
      code = parts[0][0] + parts[1][0] + parts[1][1];
    } else {
      code = parts[0].substring(0, 2) + parts[1][0];
    }
  } else if (parts.length === 1) {
    code = parts[0].substring(0, 3).padEnd(3, 'X');
  } else {
    code = 'XXX';
  }
  return code.toUpperCase();
}

async function getUniqueShortCode(name: string): Promise<string> {
  let baseCode = generateBaseShortCode(name);
  let code = baseCode;
  let attempt = 0;
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  
  while (true) {
    const exists = await prisma.center.findFirst({ where: { shortCode: code } });
    if (!exists) return code;
    
    // Collision resolution by changing the last letter
    attempt++;
    if (attempt <= 26) {
      code = baseCode.substring(0, 2) + letters[attempt - 1];
    } else {
      code = baseCode.substring(0, 1) + letters[Math.floor(attempt/26)-1] + letters[attempt%26];
    }
  }
}

async function main() {
  console.log('Starting customer code fix script...');

  // 1. Find all customers with SAT- prefix
  const targetCustomers = await prisma.customer.findMany({
    where: {
      customerNo: {
        contains: 'SAT',
      },
      centerId: {
        not: null,
      },
    },
    include: {
      center: true,
    },
  });

  console.log(`Found ${targetCustomers.length} customers with 'SAT' in customerNo.`);

  if (targetCustomers.length === 0) {
    console.log('No customers found to update. Exiting.');
    return;
  }

  // 2. Group by centerId
  const customersByCenter: Record<string, typeof targetCustomers> = {};
  for (const cus of targetCustomers) {
    const centerId = cus.centerId!;
    if (!customersByCenter[centerId]) {
      customersByCenter[centerId] = [];
    }
    customersByCenter[centerId].push(cus);
  }

  console.log(`Grouped into ${Object.keys(customersByCenter).length} centers.`);

  // 3. Process each center
  for (const [centerId, customersToUpdate] of Object.entries(customersByCenter)) {
    const center = customersToUpdate[0].center!;
    
    let shortCode = center.shortCode;

    if (!shortCode) {
      console.log(`Center "${center.name}" is missing a shortCode. Generating one...`);
      shortCode = await getUniqueShortCode(center.name);
      
      await prisma.center.update({
        where: { id: center.id },
        data: { shortCode: shortCode }
      });
      console.log(`  -> Assigned new shortCode: ${shortCode}`);
    }

    // Find current highest sequence for this center's shortCode
    const existingCustomersInCenter = await prisma.customer.findMany({
      where: {
        centerId: centerId,
        customerNo: {
          startsWith: shortCode,
        },
      },
      select: {
        customerNo: true,
      },
    });

    let maxSeq = 0;
    for (const ec of existingCustomersInCenter) {
      const numStr = ec.customerNo.replace(shortCode, '');
      const num = parseInt(numStr, 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }

    console.log(`Center "${center.name}" (${shortCode}): found max sequence = ${maxSeq}. Updating ${customersToUpdate.length} customers.`);

    // Update customers sequentially, ordering them by their createdAt or old customerNo so they get logical order
    customersToUpdate.sort((a, b) => {
      // sort by creation date ascending
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    let currentSeq = maxSeq + 1;
    for (const customer of customersToUpdate) {
      const newCustomerNo = `${shortCode}${currentSeq.toString().padStart(3, '0')}`;
      
      console.log(`  Updating ${customer.name}: ${customer.customerNo} -> ${newCustomerNo}`);
      
      await prisma.customer.update({
        where: { id: customer.id },
        data: { customerNo: newCustomerNo },
      });
      
      currentSeq++;
    }
  }

  console.log('Customer code fix completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
