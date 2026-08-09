const path = require('path');
const fs = require('fs');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'mdb-full-data.json'), 'utf8'));

const {
  MasArea,
  MasAgent,
  MasPartyGroup,
  MasChitGroup,
  MasMemberChitGroupLink,
  MasLoanPackage,
  AccMasAccounts,
  tmpMasLoanDueDetail,
  TrnChit_Receipt1,
  TrnChit_Receipt2,
} = data;

// Build account map
const accountMap = new Map();
AccMasAccounts.forEach(acc => accountMap.set(acc.Ac_Code, acc));

function safeMobile(val) {
  const m = (val || '').replace(/\D/g, '').trim();
  return m.length >= 10 ? m.slice(-10) : (m || '0000000000');
}
function padCode(n, prefix, pad = 4) {
  return `${prefix}${String(n).padStart(pad, '0')}`;
}
function safeStr(val) {
  if (!val) return null;
  const s = String(val).trim();
  return s || null;
}
function safeDateStr(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function escTs(val) {
  if (val === null || val === undefined) return 'null';
  return JSON.stringify(val);
}

// Build output
const lines = [];

lines.push(`/**`);
lines.push(` * AUTO-GENERATED SEED FILE`);
lines.push(` * Source: MAGALIRKULU2.MDB (PONNILAM FIN CORP - Sathiyamangalam)`);
lines.push(` * Generated: ${new Date().toISOString()}`);
lines.push(` *`);
lines.push(` * Data Summary:`);
lines.push(` *   Areas:       ${MasArea.length}`);
lines.push(` *   Staff:       ${MasAgent.length}`);
lines.push(` *   Centers:     ${MasChitGroup.length}`);
lines.push(` *   Customers:   ${MasMemberChitGroupLink.length}`);
lines.push(` *   Collections: ${TrnChit_Receipt2.length}`);
lines.push(` */`);
lines.push(``);
lines.push(`import { PrismaClient } from '@prisma/client';`);
lines.push(`import * as bcrypt from 'bcryptjs';`);
lines.push(``);
lines.push(`const prisma = new PrismaClient();`);
lines.push(``);
lines.push(`function padCode(n: number, prefix: string, pad = 4): string {`);
lines.push(`  return \`\${prefix}\${String(n).padStart(pad, '0')}\`;`);
lines.push(`}`);
lines.push(``);

// ── Areas ──────────────────────────────────────────────────────────────────
// Collect all unique area names (from MasArea + from center areas)
const areaNames = new Set();
MasArea.filter(a => a.Active).forEach(a => areaNames.add(a.Area_Name.trim()));
MasChitGroup.filter(c => c.Active && c.Area).forEach(c => areaNames.add(c.Area.trim()));

lines.push(`// ─── Static Data ──────────────────────────────────────────────────────────`);
lines.push(``);
lines.push(`const AREA_NAMES = ${JSON.stringify([...areaNames], null, 2)};`);
lines.push(``);

// ── Agents (Staff) ──────────────────────────────────────────────────────────
const agents = MasAgent.filter(a => a.Active).map(a => ({
  code: a.Agent_Code,
  staffNo: padCode(a.Agent_Code, 'STF'),
  name: a.Agent_Name.trim(),
  phone: safeMobile(a.Phone),
}));
lines.push(`const AGENTS = ${JSON.stringify(agents, null, 2)};`);
lines.push(``);

// ── Loan Packages ─────────────────────────────────────────────────────────
const packages = MasLoanPackage.map(p => ({
  code: p.LoanPackage_Code,
  name: p.LoanPackage_Name.trim(),
  interestRate: p.ROI || 0,
  durationDays: (p.NoOfDues || 28) * 7,
  frequency: p.PaymentMode || 'WEEKLY',
  noOfDues: p.NoOfDues || 28,
  perDueAmt: p.PerDueAmt || 650,
}));
lines.push(`const LOAN_PACKAGES = ${JSON.stringify(packages, null, 2)};`);
lines.push(``);

// ── Centers ───────────────────────────────────────────────────────────────
const centers = MasChitGroup.filter(c => c.Active).map(c => ({
  code: c.ChitGroup_Code,
  centerCode: padCode(c.ChitGroup_Code, 'CTR'),
  name: c.ChitGroup_Name.trim(),
  area: (c.Area || 'BANNARI ROAD').trim(),
  centerTime: safeStr(c.CentreTime),
  repaymentType: c.RePaymentMode || 'WEEKLY',
  disbursMode: c.DisbursementMode || 'CASH',
  totalMembers: c.Tot_Members || 0,
  agentCode: c.Agent_Code || null,
}));
lines.push(`const CENTERS = ${JSON.stringify(centers, null, 2)};`);
lines.push(``);

// ── Groups (Party Groups) ─────────────────────────────────────────────────
const groups = MasPartyGroup.filter(g => g.PartyGroup_Name !== '-').map(g => ({
  code: g.PartyGroup_Code,
  name: g.PartyGroup_Name,
}));
lines.push(`const PARTY_GROUPS = ${JSON.stringify(groups, null, 2)};`);
lines.push(``);

// ── Customers ─────────────────────────────────────────────────────────────
const customers = MasMemberChitGroupLink.map(link => {
  const acc = accountMap.get(link.Ac_Code) || {};
  return {
    chitGroupCode: link.ChitGroup_Code,
    memberCode: link.Member_Code,
    acCode: link.Ac_Code,
    partyGroupCode: link.PartyGroup_Code || 1,
    agentCode: link.Agent_Code || null,
    customerNo: `BR001-${padCode(link.Ac_Code, 'C', 5)}`,
    name: safeStr(acc.Ac_Name) || `MEMBER-${link.Ac_Code}`,
    mobile: safeMobile(acc.Mobile || acc.Phone),
    phone: safeStr(acc.Phone),
    address: safeStr(acc.Address),
    place: safeStr(acc.Place),
    dob: safeDateStr(acc.DOB),
    maritalStatus: acc.Married ? 'MARRIED' : null,
    residenceType: acc.OwnHouse ? 'OWN' : 'RENTED',
    occupation: safeStr(acc.Occupation),
    fatherName: safeStr(acc.Father_Name),
    motherName: safeStr(acc.Mother_Name),
    fatherDob: safeDateStr(acc.Father_DOB),
    motherDob: safeDateStr(acc.Mother_DOB),
    familyMembers: acc.NoOfFM || 0,
    nominee: safeStr(acc.Nominee),
    relationship: safeStr(acc.Relationship),
    isActive: link.Active ?? true,
    // KYC
    id1Type: safeStr(acc.ID1),
    id1No: safeStr(acc.KYCNoId1),
    id1Name: safeStr(acc.NameOnId1),
    id1Dob: safeDateStr(acc.DOBId1),
    id1Issue: safeDateStr(acc.IssueDtId1),
    id2Type: safeStr(acc.ID2),
    id2No: safeStr(acc.KYCNoId2),
    id2Name: safeStr(acc.NameOnId2),
    id2Dob: safeDateStr(acc.DOBId2),
    id2Issue: safeDateStr(acc.IssueDtId2),
    // Bank
    bankAccHolder: safeStr(acc.BankAc_Name),
    bankAccNo: safeStr(acc.BankAc_No),
    bankAccType: safeStr(acc.BankAc_Type),
    bankIfsc: safeStr(acc.BankIFSC_Code),
    bankName: safeStr(acc.Bank_Name),
    bankBranch: safeStr(acc.Bank_BranchName),
    // Co-applicant
    coName: safeStr(acc.Ac_NameCo),
    coDob: safeDateStr(acc.DOBCo),
    coRelationship: safeStr(acc.Relationship),
    coOccupation: safeStr(acc.OccupationCo),
  };
});
lines.push(`const CUSTOMERS = ${JSON.stringify(customers, null, 2)};`);
lines.push(``);

// ── Loans ─────────────────────────────────────────────────────────────────
const loans = MasMemberChitGroupLink.filter(l => l.LoanSanction).map(link => ({
  chitGroupCode: link.ChitGroup_Code,
  memberCode: link.Member_Code,
  acCode: link.Ac_Code,
  agentCode: link.Agent_Code || null,
  loanNumber: `BR001-${padCode(link.Ac_Code, 'LN', 5)}`,
  amount: link.PartyRecd_Amt || link.Chit_Amt || 0,
  status: link.Closed ? 'CLOSED' : link.Dropped ? 'DROPPED' : link.PreClose ? 'CLOSED' : 'ACTIVE',
  disbursementDate: safeDateStr(link.Disburse_Dt),
  applicationDate: safeDateStr(link.Join_Dt),
  noOfDues: link.NoOfDues || 28,
  perDueAmount: link.PerDueAmt || 650,
  totalDueAmount: link.DueAmount || 0,
  deductionAmount: link.Reduced_Amt || 0,
  netDisbursement: link.PartyRecd_Amt || 0,
  outstandingAmount: Math.max(0, (link.DueAmount || 0) - (link.DueAmountRecd || 0)),
  salary: link.Salary || 0,
  interest: link.Interest || 0,
  additional: link.Additional || 0,
  otherIncome: link.Others || 0,
  totalIncome: link.TotIncome || 0,
  food: link.Food || 0,
  rent: link.House || 0,
  mobile: link.Mobile || 0,
  education: link.Education || 0,
  loanObligation: link.LoanObligation || 0,
  otherExpense: link.OtherExpenses || 0,
  totalExpense: link.TotExpenses || 0,
  eligibleEmi: link.EMI || 0,
  packageCode: 1,
  lastRecdDt: safeDateStr(link.LastRecd_Dt),
  lastRecdAmt: link.LastRecd_Amt || 0,
}));
lines.push(`const LOANS = ${JSON.stringify(loans, null, 2)};`);
lines.push(``);

// ── Loan Schedules ────────────────────────────────────────────────────────
const schedules = tmpMasLoanDueDetail.map(d => ({
  chitGroupCode: d.ChitGroup_Code,
  memberCode: d.Member_Code,
  dueNo: d.DueNo,
  dueDate: safeDateStr(d.DueDt),
  perDueAmt: d.PerDueAmt || 650,
}));
lines.push(`const LOAN_SCHEDULES = ${JSON.stringify(schedules, null, 2)};`);
lines.push(``);

// ── Collections ───────────────────────────────────────────────────────────
// Join receipt header and detail
const collections = TrnChit_Receipt2
  .filter(l => !l.Cancelled)
  .map(line => {
    const header = TrnChit_Receipt1.find(h => h.Trn_No === line.Trn_No);
    const trnDate = header ? safeDateStr(header.Trn_Dt) : null;
    const collDay = trnDate ? trnDate.split('T')[0] : null;
    return {
      trnNumber: `${line.Trn_No}-${line.Indx}`,
      trnDate,
      collectionDay: collDay,
      chitGroupCode: line.ChitGroup_Code,
      memberCode: line.Member_Code,
      amount: line.Amount || 0,
      remarks: safeStr(line.Remarks),
    };
  })
  .filter(c => c.trnDate && c.collectionDay);
lines.push(`const COLLECTIONS = ${JSON.stringify(collections, null, 2)};`);
lines.push(``);

// ── Main Seed Function ────────────────────────────────────────────────────
const seedFn = `
// ─── ID Maps ─────────────────────────────────────────────────────────────────
const areaIdMap   = new Map<string, string>();  // area name -> prisma id
const agentIdMap  = new Map<number, string>();  // agent code -> prisma staff id
const centerIdMap = new Map<number, string>();  // chitGroupCode -> prisma center id
const groupIdMap  = new Map<string, string>();  // \`\${centerCode}-\${groupName}\` -> prisma group id
const memberIdMap = new Map<string, string>();  // \`\${chitGroupCode}-\${memberCode}\` -> customer id
const loanIdMap   = new Map<string, string>();  // same key -> loan id
const pkgIdMap    = new Map<number, string>();  // package code -> loan package id

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  PONNILAM FIN CORP - Seed from MDB Data          ║');
  console.log('╚══════════════════════════════════════════════════╝');

  // 1. Branch Setup
  console.log('\\n[1/7] Branch...');
  const state = await prisma.state.upsert({
    where: { name: 'Tamil Nadu' }, update: {}, create: { name: 'Tamil Nadu' },
  });
  const district = await prisma.district.upsert({
    where: { name_stateId: { name: 'Erode', stateId: state.id } },
    update: {}, create: { name: 'Erode', stateId: state.id },
  });
  const branch = await prisma.branch.upsert({
    where: { code: 'BR001' }, update: {},
    create: {
      name: 'Sathiyamangalam', code: 'BR001',
      location: '13/04, VSB Nest, Sri Venugopalasamy Temple Street, Sathyamangalam - 638 401.',
      phone: '9944533403',
      stateId: state.id, districtId: district.id,
    },
  });
  console.log('  Branch:', branch.name, branch.id);

  // 2. Areas
  console.log('\\n[2/7] Areas...');
  for (const areaName of AREA_NAMES) {
    const area = await prisma.area.upsert({
      where: { branchId_name: { branchId: branch.id, name: areaName } },
      update: {}, create: { name: areaName, branchId: branch.id },
    });
    areaIdMap.set(areaName, area.id);
    console.log('  Area:', areaName);
  }

  // 3. Staff
  console.log('\\n[3/7] Staff...');
  const agentRole = await prisma.role.upsert({ where: { name: 'Agent' }, update: {}, create: { name: 'Agent' } });
  await prisma.role.upsert({ where: { name: 'Admin' }, update: {}, create: { name: 'Admin' } });
  const hashedPwd = await bcrypt.hash('Password@123', 10);
  for (const agent of AGENTS) {
    const staff = await prisma.staff.upsert({
      where: { phone: agent.phone },
      update: { name: agent.name },
      create: {
        staffNo: agent.staffNo, name: agent.name, phone: agent.phone,
        password: hashedPwd, branchId: branch.id, roleId: agentRole.id, mustChangePassword: true,
      },
    });
    agentIdMap.set(agent.code, staff.id);
    console.log('  Staff:', agent.name);
  }

  // 4. Loan Packages
  console.log('\\n[4/7] Loan Packages...');
  for (const pkg of LOAN_PACKAGES) {
    const lp = await prisma.loanPackage.upsert({
      where: { name: pkg.name }, update: {},
      create: { name: pkg.name, interestRate: pkg.interestRate, durationDays: pkg.durationDays, frequency: pkg.frequency },
    });
    pkgIdMap.set(pkg.code, lp.id);
    console.log('  Package:', pkg.name);
  }
  const defaultPkgId = pkgIdMap.get(1) || (await prisma.loanPackage.findFirst())!.id;

  // 5. Centers + Groups
  console.log('\\n[5/7] Centers & Groups...');
  for (const c of CENTERS) {
    const areaId = areaIdMap.get(c.area);
    if (!areaId) { console.warn('  [SKIP] Area not found:', c.area); continue; }
    const agentId = c.agentCode ? agentIdMap.get(c.agentCode) ?? null : null;
    const center = await prisma.center.upsert({
      where: { areaId_name: { areaId, name: c.name } }, update: {},
      create: {
        name: c.name, code: c.centerCode, centerTime: c.centerTime,
        repaymentType: c.repaymentType, disbursMode: c.disbursMode,
        totalMembers: c.totalMembers, areaId, employeeId: agentId,
      },
    });
    centerIdMap.set(c.code, center.id);
    for (const pg of PARTY_GROUPS) {
      const group = await prisma.group.upsert({
        where: { centerId_groupName: { centerId: center.id, groupName: pg.name } }, update: {},
        create: { groupCode: \`\${c.centerCode}-\${pg.name}\`, groupName: pg.name, centerId: center.id },
      });
      groupIdMap.set(\`\${c.code}-\${pg.name}\`, group.id);
    }
  }
  console.log('  Centers seeded:', CENTERS.length);

  // 6. Customers
  console.log('\\n[6/7] Customers...');
  const defaultArea = (await prisma.area.findFirst({ where: { branchId: branch.id } }))!;
  let custCount = 0, custSkip = 0;
  for (const cust of CUSTOMERS) {
    const centerId = centerIdMap.get(cust.chitGroupCode);
    if (!centerId) { custSkip++; continue; }
    const center = await prisma.center.findUnique({ where: { id: centerId }, select: { areaId: true } });
    const areaId = center?.areaId || defaultArea.id;
    const groupId = groupIdMap.get(\`\${cust.chitGroupCode}-G\${cust.partyGroupCode}\`) ?? null;
    const empId = cust.agentCode ? agentIdMap.get(cust.agentCode) ?? null : null;
    const customer = await prisma.customer.upsert({
      where: { customerNo: cust.customerNo }, update: {},
      create: {
        customerNo: cust.customerNo, name: cust.name, mobile: cust.mobile || '0000000000',
        phone: cust.phone, address: cust.address, dob: cust.dob ? new Date(cust.dob) : null,
        maritalStatus: cust.maritalStatus, residenceType: cust.residenceType,
        occupation: cust.occupation, fatherName: cust.fatherName, motherName: cust.motherName,
        fatherDob: cust.fatherDob ? new Date(cust.fatherDob) : null,
        motherDob: cust.motherDob ? new Date(cust.motherDob) : null,
        familyMembers: cust.familyMembers,
        areaId, centerId, groupId, employeeId: empId, isActive: cust.isActive,
      },
    });
    if (cust.id1No || cust.id2No) {
      await prisma.customerKyc.upsert({
        where: { customerId: customer.id }, update: {},
        create: {
          customerId: customer.id,
          idProof1Type: cust.id1Type, idProof1No: cust.id1No, idProof1Name: cust.id1Name,
          idProof1Dob: cust.id1Dob ? new Date(cust.id1Dob) : null,
          idProof1IssueDate: cust.id1Issue ? new Date(cust.id1Issue) : null,
          idProof2Type: cust.id2Type, idProof2No: cust.id2No, idProof2Name: cust.id2Name,
          idProof2Dob: cust.id2Dob ? new Date(cust.id2Dob) : null,
          idProof2IssueDate: cust.id2Issue ? new Date(cust.id2Issue) : null,
        },
      });
    }
    if (cust.bankAccNo) {
      await prisma.customerBank.upsert({
        where: { customerId: customer.id }, update: {},
        create: {
          customerId: customer.id, accountHolder: cust.bankAccHolder, accountNumber: cust.bankAccNo,
          ifsc: cust.bankIfsc, bankName: cust.bankName, branchName: cust.bankBranch,
        },
      });
    }
    if (cust.coName) {
      await prisma.customerCoApplicant.upsert({
        where: { customerId: customer.id }, update: {},
        create: {
          customerId: customer.id, name: cust.coName,
          dob: cust.coDob ? new Date(cust.coDob) : null,
          relationship: cust.coRelationship, occupation: cust.coOccupation,
        },
      });
    }
    memberIdMap.set(\`\${cust.chitGroupCode}-\${cust.memberCode}\`, customer.id);
    custCount++;
  }
  console.log(\`  Customers: \${custCount} seeded, \${custSkip} skipped\`);

  // 7. Loans + Schedules + Collections
  console.log('\\n[7/7] Loans, Schedules & Collections...');
  const defaultStaff = (await prisma.staff.findFirst())!;
  let loanCount = 0, schedCount = 0, collCount = 0, collSkip = 0;

  // Build schedule map
  const scheduleMap = new Map<string, typeof LOAN_SCHEDULES>();
  for (const s of LOAN_SCHEDULES) {
    const k = \`\${s.chitGroupCode}-\${s.memberCode}\`;
    if (!scheduleMap.has(k)) scheduleMap.set(k, []);
    scheduleMap.get(k)!.push(s);
  }

  for (const loan of LOANS) {
    const key = \`\${loan.chitGroupCode}-\${loan.memberCode}\`;
    const customerId = memberIdMap.get(key);
    if (!customerId) { continue; }
    const staffId = loan.agentCode ? agentIdMap.get(loan.agentCode) ?? defaultStaff.id : defaultStaff.id;
    const loanRec = await prisma.loan.upsert({
      where: { loanNumber: loan.loanNumber }, update: {},
      create: {
        loanNumber: loan.loanNumber, amount: loan.amount, status: loan.status,
        interestRate: 30,
        disbursementDate: loan.disbursementDate ? new Date(loan.disbursementDate) : null,
        applicationDate: loan.applicationDate ? new Date(loan.applicationDate) : null,
        noOfDues: loan.noOfDues, perDueAmount: loan.perDueAmount,
        totalDueAmount: loan.totalDueAmount, deductionAmount: loan.deductionAmount,
        netDisbursement: loan.netDisbursement, outstandingAmount: loan.outstandingAmount,
        salary: loan.salary, interest: loan.interest, additional: loan.additional,
        otherIncome: loan.otherIncome, totalIncome: loan.totalIncome,
        food: loan.food, rent: loan.rent, mobile: loan.mobile, education: loan.education,
        loanObligation: loan.loanObligation, otherExpense: loan.otherExpense,
        totalExpense: loan.totalExpense, eligibleEmi: loan.eligibleEmi,
        customerId, packageId: defaultPkgId, staffId,
      },
    });
    loanIdMap.set(key, loanRec.id);
    loanCount++;

    for (const s of scheduleMap.get(key) || []) {
      if (!s.dueDate) continue;
      await prisma.loanSchedule.create({
        data: { loanId: loanRec.id, dueDate: new Date(s.dueDate), emiAmount: s.perDueAmt, status: 'PENDING' },
      }).catch(() => {});
      schedCount++;
    }
  }

  for (const col of COLLECTIONS) {
    const key = \`\${col.chitGroupCode}-\${col.memberCode}\`;
    const loanId = loanIdMap.get(key);
    if (!loanId || !col.trnDate) { collSkip++; continue; }
    const staffId = defaultStaff.id;
    await prisma.collection.upsert({
      where: { trnNumber: col.trnNumber }, update: {},
      create: {
        trnNumber: col.trnNumber, trnDate: new Date(col.trnDate),
        collectionDay: col.collectionDay!, amount: col.amount,
        remarks: col.remarks, loanId, staffId,
      },
    }).catch(() => {});
    collCount++;
  }

  console.log(\`  Loans: \${loanCount}, Schedules: \${schedCount}, Collections: \${collCount} (skipped: \${collSkip})\`);

  // Report
  console.log('\\n╔══════════════════════════════════════════════════╗');
  console.log('║                 SEED COMPLETE ✅                   ║');
  console.log('╚══════════════════════════════════════════════════╝');
  const [a,c,s,cu,l,co] = await Promise.all([
    prisma.area.count(), prisma.center.count(), prisma.staff.count(),
    prisma.customer.count(), prisma.loan.count(), prisma.collection.count(),
  ]);
  console.log(\`  Areas:       \${a}\`);
  console.log(\`  Centers:     \${c}\`);
  console.log(\`  Staff:       \${s}\`);
  console.log(\`  Customers:   \${cu}\`);
  console.log(\`  Loans:       \${l}\`);
  console.log(\`  Collections: \${co}\`);
}

main().catch(console.error).finally(() => prisma.\$disconnect());
`;

lines.push(seedFn);

const finalContent = lines.join('\n');
fs.writeFileSync(path.join(__dirname, '..', 'ponnilam_server', 'prisma', 'seed.ts'), finalContent);
console.log('✅ Seed file written to: ponnilam_server/prisma/seed.ts');
console.log('   File size:', fs.statSync(path.join(__dirname, '..', 'ponnilam_server', 'prisma', 'seed.ts')).size, 'bytes');
