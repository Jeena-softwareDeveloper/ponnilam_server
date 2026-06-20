const ADODB = require('node-adodb');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const connection = ADODB.open('Provider=Microsoft.Jet.OLEDB.4.0;Data Source=D:\\access\\SS\\server\\MAGALIRKULU2.MDB;Jet OLEDB:Database Password=abcsSm;');

// Memory maps for old IDs to new UUIDs
const mapArea = {};
const mapStaff = {};
const mapCenter = {};
const mapLoanPackage = {};
const mapCustomer = {};
const oldGroupMap = {}; // mapping PartyGroup_Code -> name
const mapGroupDb = {}; // mapping centerId + groupName -> groupId

async function runMigration() {
  console.log("Starting Migration...");

  // 1. Setup Default Role & Branch
  const defaultRole = await prisma.role.upsert({
    where: { name: 'Staff' },
    update: {},
    create: { name: 'Staff' }
  });

  const mainBranch = await prisma.branch.upsert({
    where: { code: 'SATHY' },
    update: {},
    create: { name: 'Sathiyamangalam', code: 'SATHY', location: 'Sathiyamangalam', isActive: true }
  });

  // 2. Migrate Area
  const areas = await connection.query('SELECT * FROM [MasArea]');
  console.log(`Migrating ${areas.length} Areas...`);
  for (const a of areas) {
    if (!a.Area_Name) continue;
    let existing = await prisma.area.findFirst({ where: { name: a.Area_Name } });
    if (!existing) {
      existing = await prisma.area.create({ data: { name: a.Area_Name, isActive: a.Active, branchId: mainBranch.id } });
    }
    mapArea[a.Area_Code] = existing.id;
  }

  // 3. Migrate Staff (Agent)
  const staffs = await connection.query('SELECT * FROM [MasAgent]');
  console.log(`Migrating ${staffs.length} Staffs...`);
  for (const s of staffs) {
    if (!s.Agent_Name) continue;
    const phone = s.Phone || s.EmergencyNo || '0000000000';
    let existing = await prisma.staff.findFirst({ where: { name: s.Agent_Name } });
    if (!existing) {
      const password = await bcrypt.hash(phone, 10);
      const username = (s.Agent_Name.replace(/\\s/g, '').toLowerCase() + s.Agent_Code).substring(0, 15);
      existing = await prisma.staff.create({
        data: {
          name: s.Agent_Name, phone: phone, username: username, password: password,
          isActive: s.Active, roleId: defaultRole.id, branchId: mainBranch.id
        }
      });
    }
    mapStaff[s.Agent_Code] = existing.id;
  }

  // 4. Migrate Groups (Memory Only)
  const pGroups = await connection.query('SELECT * FROM [MasPartyGroup]');
  for (const pg of pGroups) {
    oldGroupMap[pg.PartyGroup_Code] = pg.PartyGroup_Name;
  }

  // 5. Migrate Centers (ChitGroup)
  const centers = await connection.query('SELECT * FROM [MasChitGroup]');
  console.log(`Migrating ${centers.length} Centers...`);
  for (const c of centers) {
    if (!c.ChitGroup_Name) continue;
    let areaId = mapArea[1]; 
    const area = await prisma.area.findFirst({ where: { name: c.Area } });
    if (area) areaId = area.id;

    let existing = await prisma.center.findFirst({ where: { name: c.ChitGroup_Name } });
    if (!existing) {
      existing = await prisma.center.create({
        data: {
          name: c.ChitGroup_Name, code: "C" + c.ChitGroup_Code,
          centerTime: c.CentreTime || "", repaymentType: c.RePaymentMode || "WEEKLY",
          disbursMode: c.DisbursementMode || "CASH", totalMembers: c.Tot_Members || 0,
          isActive: c.Active, areaId: areaId, employeeId: mapStaff[c.Agent_Code] || null,
        }
      });
    }
    mapCenter[c.ChitGroup_Code] = existing.id;
  }

  // 6. Migrate Loan Packages
  const packages = await connection.query('SELECT * FROM [MasLoanPackage]');
  console.log(`Migrating ${packages.length} Packages...`);
  for (const p of packages) {
    if (!p.LoanPackage_Name) continue;
    let existing = await prisma.loanPackage.findFirst({ where: { name: p.LoanPackage_Name } });
    if (!existing) {
      existing = await prisma.loanPackage.create({
        data: {
          name: p.LoanPackage_Name,
          interestRate: parseFloat(p.ROI) || 0,
          durationDays: parseInt(p.NoOfDues) || 0,
          frequency: p.PaymentMode || 'WEEKLY',
          isActive: p.Active
        }
      });
    }
    mapLoanPackage[p.LoanPackage_Code] = existing.id;
  }

  // 7. Migrate Customers
  const customers = await connection.query('SELECT * FROM [AccMasAccounts] WHERE Group_Code = 7');
  console.log(`Migrating ${customers.length} Customers...`);
  for (const c of customers) {
    if (!c.Ac_Name) continue;
    let phone = c.Phone || c.Mobile || '0000000000';
    let aadhar = c.IDProofDetail1 || `A${c.Ac_Code}`; // Failsafe
    
    // Check existing
    let existing = await prisma.customer.findFirst({ where: { customerNo: `CUST${c.Ac_Code}` } });
    if (!existing) {
      // Find area
      let areaId = mapArea[c.Area_Code] || Object.values(mapArea)[0];
      if (!areaId) continue; // Skip if no area
      
      existing = await prisma.customer.create({
        data: {
          customerNo: `CUST${c.Ac_Code}`,
          name: c.Ac_Name,
          phone: phone,
          address: c.Address || "",
          areaId: areaId,
          centerId: null, // Will update when we assign loan
          isActive: c.Active
        }
      });

      // Insert KYC
      await prisma.customerKyc.create({
        data: {
          customerId: existing.id,
          idProof1Type: 'AADHAR',
          idProof1No: aadhar,
        }
      });

      // Insert CoApplicant
      if (c.Ac_NameCo) {
        await prisma.customerCoApplicant.create({
          data: {
            customerId: existing.id,
            name: c.Ac_NameCo,
            relationship: 'HUSBAND/WIFE'
          }
        });
      }
    }
    mapCustomer[c.Ac_Code] = existing.id;
  }

  // 8. Migrate Loans
  const loans = await connection.query('SELECT * FROM [MasMemberChitGroupLink]');
  console.log(`Migrating ${loans.length} Loans...`);
  for (const l of loans) {
    const custId = mapCustomer[l.Ac_Code];
    const centId = mapCenter[l.ChitGroup_Code];
    if (!custId || !centId) continue;

    // Get or Create Group
    const gName = oldGroupMap[l.PartyGroup_Code] || "G1";
    const cacheKey = centId + gName;
    let groupId = mapGroupDb[cacheKey];
    if (!groupId) {
      let g = await prisma.group.findUnique({ where: { centerId_groupName: { centerId: centId, groupName: gName } } });
      if (!g) {
        g = await prisma.group.create({ data: { groupName: gName, centerId: centId } });
      }
      groupId = g.id;
      mapGroupDb[cacheKey] = groupId;
    }

    // Assign customer to center and group
    await prisma.customer.update({
      where: { id: custId },
      data: { centerId: centId, groupId: groupId }
    });

    // We don't have loan package mapping directly in this table, we guess it from LoanAmt
    const loanAmt = parseFloat(l.DueAmount || 0); // Note: DueAmount is principal+interest. Wait, PartyRecd_Amt is principal.
    const principal = parseFloat(l.PartyRecd_Amt || 0);
    
    // Create Loan
    const existingLoan = await prisma.loan.findFirst({
        where: {
          customerId: custId
        }
      });if (!existingLoan) {
      let status = l.Closed ? "CLOSED" : (l.Disbursement ? "ACTIVE" : "PENDING");
      
      const createdLoan = await prisma.loan.create({
        data: {
          loanNumber: `LOAN${l.Ac_Code}-${l.ChitGroup_Code}`,
          customerId: custId,
          staffId: mapStaff[l.Agent_Code] || Object.values(mapStaff)[0],
          packageId: Object.values(mapLoanPackage)[0], // fallback
          amount: principal,
          perDueAmount: parseFloat(l.PerDueAmt || 0),
          noOfDues: parseInt(l.NoOfDues || 0),
          totalDueAmount: parseFloat(l.DueAmount || 0),
          outstandingAmount: parseFloat(l.DueAmount || 0) - parseFloat(l.DueAmountRecd || 0),
          status: status,
          applicationDate: l.Join_Dt ? new Date(l.Join_Dt) : new Date(),
        }
      });
      
      // Auto-generate EMIs
      let emiPromises = [];
      const emiAmt = createdLoan.perDueAmount;
      const totalPaid = parseFloat(l.DueAmountRecd || 0);
      let paidEmis = Math.floor(totalPaid / emiAmt);
      
      for (let i = 1; i <= createdLoan.noOfDues; i++) {
        let isPaid = i <= paidEmis;
        emiPromises.push({
          loanId: createdLoan.id,
          emiAmount: emiAmt,
          amountPaid: isPaid ? emiAmt : 0,
          dueDate: new Date(createdLoan.applicationDate.getTime() + i * 7 * 24 * 60 * 60 * 1000), // Approx weekly
          status: isPaid ? 'PAID' : 'PENDING'
        });
      }
      
      if (emiPromises.length > 0) {
        await prisma.loanSchedule.createMany({ data: emiPromises });
      }
    }
  }

  // 9. Migrate Collections
  console.log(`Skipping direct collections since EMIs were auto-generated based on total received.`);
  console.log("Migration Complete!");
}

runMigration()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    console.log("Done.");
  });
