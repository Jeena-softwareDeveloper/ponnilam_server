import fs from 'fs';
import readline from 'readline';
import path from 'path';

const dumpFile = path.join(__dirname, 'ponnilamfincorp_2026-10-20_12-41-14_pgsql_data.sql');

interface TableData {
  columns: string[];
  rows: string[][];
}

async function parseDump() {
  console.log(`Starting analysis of dump: ${dumpFile}`);
  const fileStream = fs.createReadStream(dumpFile, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const tables: Record<string, TableData> = {};
  let currentTable: string | null = null;
  let currentColumns: string[] = [];

  for await (const line of rl) {
    if (line.startsWith('COPY public."')) {
      const match = line.match(/^COPY public\."([^"]+)" \((.+)\) FROM stdin;/);
      if (match) {
        currentTable = match[1];
        currentColumns = match[2].split(', ').map(c => c.replace(/"/g, ''));
        tables[currentTable] = { columns: currentColumns, rows: [] };
      }
      continue;
    }

    if (line === '\\.' && currentTable) {
      currentTable = null;
      currentColumns = [];
      continue;
    }

    if (currentTable) {
      const cols = line.split('\t');
      tables[currentTable].rows.push(cols);
    }
  }

  console.log('--- TABLES PARSED ---');
  for (const [tName, data] of Object.entries(tables)) {
    console.log(`  Table "${tName}": ${data.rows.length} rows`);
  }

  // 1. SPECIFIC CHECK: Loan SAT-L0440
  console.log('\n======================================================');
  console.log('1. CHECKING TARGET LOAN: SAT-L0440');
  console.log('======================================================');
  const loanTable = tables['Loan'];
  const loanNumIdx = loanTable?.columns.indexOf('loanNumber') ?? -1;
  const loanStatusIdx = loanTable?.columns.indexOf('status') ?? -1;
  const loanAmtIdx = loanTable?.columns.indexOf('amount') ?? -1;
  const loanOutIdx = loanTable?.columns.indexOf('outstandingAmount') ?? -1;
  const loanCustIdIdx = loanTable?.columns.indexOf('customerId') ?? -1;
  const loanCenterIdIdx = loanTable?.columns.indexOf('centerId') ?? -1;
  const loanIdIdx = loanTable?.columns.indexOf('id') ?? -1;

  const satL0440 = loanTable?.rows.find(r => r[loanNumIdx] === 'SAT-L0440');
  const satL0442 = loanTable?.rows.find(r => r[loanNumIdx] === 'SAT-L0442');

  if (satL0440) {
    console.log('⚠️ SAT-L0440 IS STILL PRESENT in database:', {
      loanNumber: satL0440[loanNumIdx],
      status: satL0440[loanStatusIdx],
      amount: satL0440[loanAmtIdx],
      outstanding: satL0440[loanOutIdx],
    });
  } else {
    console.log('✅ SAT-L0440 is NOT FOUND (Successfully DELETED from database!)');
  }

  if (satL0442) {
    console.log('✅ SAT-L0442 is SAFE and INTACT:', {
      loanNumber: satL0442[loanNumIdx],
      status: satL0442[loanStatusIdx],
      amount: satL0442[loanAmtIdx],
      outstanding: satL0442[loanOutIdx],
    });
  }

  // 2. SPECIFIC CHECK: REACTIVATED CENTERS & LOANS
  console.log('\n======================================================');
  console.log('2. CHECKING REACTIVATED CENTERS & LOANS');
  console.log('======================================================');
  const targetLoanNumbers = [
    // MOHANA THATTAMPUDHUR
    'SAT-L0262', 'SAT-L0263', 'SAT-L0264', 'SAT-L0265', 'SAT-L0266',
    // PARVATHI UTHANDIYUR
    'SAT-L0272', 'SAT-L0273', 'SAT-L0274', 'SAT-L0275', 'SAT-L0276',
    // MEENA THATTAMPUDUR
    'SAT-L0282', 'SAT-L0283', 'SAT-L0284', 'SAT-L0285', 'SAT-L0286'
  ];

  const custTable = tables['Customer'];
  const custIdIdx = custTable?.columns.indexOf('id') ?? -1;
  const custNoIdx = custTable?.columns.indexOf('customerNo') ?? -1;
  const custNameIdx = custTable?.columns.indexOf('name') ?? -1;
  const custIsActiveIdx = custTable?.columns.indexOf('isActive') ?? -1;

  const centerTable = tables['Center'];
  const centerIdIdx = centerTable?.columns.indexOf('id') ?? -1;
  const centerCodeIdx = centerTable?.columns.indexOf('code') ?? -1;
  const centerNameIdx = centerTable?.columns.indexOf('name') ?? -1;
  const centerIsActiveIdx = centerTable?.columns.indexOf('isActive') ?? -1;

  const custMap = new Map<string, { no: string; name: string; isActive: string }>();
  for (const c of custTable?.rows || []) {
    custMap.set(c[custIdIdx], { no: c[custNoIdx], name: c[custNameIdx], isActive: c[custIsActiveIdx] });
  }

  const centerMap = new Map<string, { code: string; name: string; isActive: string }>();
  for (const ctr of centerTable?.rows || []) {
    centerMap.set(ctr[centerIdIdx], { code: ctr[centerCodeIdx], name: ctr[centerNameIdx], isActive: ctr[centerIsActiveIdx] });
  }

  const schedTable = tables['LoanSchedule'];
  const schLoanIdIdx = schedTable?.columns.indexOf('loanId') ?? -1;
  const schStatusIdx = schedTable?.columns.indexOf('status') ?? -1;
  const schEmiIdx = schedTable?.columns.indexOf('emiAmount') ?? -1;
  const schPaidIdx = schedTable?.columns.indexOf('amountPaid') ?? -1;

  const schedMap = new Map<string, { total: number; paid: number; pending: number; unpaidSum: number }>();
  for (const s of schedTable?.rows || []) {
    const lId = s[schLoanIdIdx];
    let stat = schedMap.get(lId);
    if (!stat) {
      stat = { total: 0, paid: 0, pending: 0, unpaidSum: 0 };
      schedMap.set(lId, stat);
    }
    stat.total++;
    const emi = parseFloat(s[schEmiIdx]) || 0;
    const paid = parseFloat(s[schPaidIdx]) || 0;
    if (s[schStatusIdx] === 'PAID') {
      stat.paid++;
    } else {
      stat.pending++;
      stat.unpaidSum += (emi - paid);
    }
  }

  let reactivatedCount = 0;
  for (const ln of targetLoanNumbers) {
    const lRow = loanTable?.rows.find(r => r[loanNumIdx] === ln);
    if (!lRow) {
      console.log(`❌ Loan ${ln} NOT FOUND in Loan table`);
      continue;
    }
    const cust = custMap.get(lRow[loanCustIdIdx]);
    const ctr = centerMap.get(lRow[loanCenterIdIdx]);
    const sched = schedMap.get(lRow[loanIdIdx]) || { total: 0, paid: 0, pending: 0, unpaidSum: 0 };
    const status = lRow[loanStatusIdx];
    const outAmt = parseFloat(lRow[loanOutIdx]) || 0;

    if (status === 'ACTIVE') reactivatedCount++;

    console.log(`  [${status === 'ACTIVE' ? '🟢 ACTIVE' : '🔴 ' + status}] ${ln} | Cust: ${cust?.no} - ${cust?.name} (Active: ${cust?.isActive}) | Center: ${ctr?.name} (Active: ${ctr?.isActive}) | Out: ₹${outAmt} | Scheds: ${sched.paid} Paid / ${sched.pending} Pending (Total ${sched.total})`);
  }
  console.log(`=> Result: ${reactivatedCount} / ${targetLoanNumbers.length} target loans are in ACTIVE status!`);

  // 3. SUMMARY METRICS
  console.log('\n======================================================');
  console.log('3. OVERALL SYSTEM METRICS');
  console.log('======================================================');
  console.log(`Total Customers: ${custTable?.rows.length}`);
  const activeCustCount = custTable?.rows.filter(r => r[custIsActiveIdx] === 't' || r[custIsActiveIdx] === 'true').length;
  console.log(`  - Active Customers: ${activeCustCount}`);
  console.log(`  - Inactive Customers: ${(custTable?.rows.length || 0) - (activeCustCount || 0)}`);

  console.log(`\nTotal Loans: ${loanTable?.rows.length}`);
  const loanStatusCounts: Record<string, number> = {};
  let totalOutstanding = 0;
  for (const l of loanTable?.rows || []) {
    const st = l[loanStatusIdx];
    loanStatusCounts[st] = (loanStatusCounts[st] || 0) + 1;
    if (st === 'ACTIVE') {
      totalOutstanding += (parseFloat(l[loanOutIdx]) || 0);
    }
  }
  for (const [st, cnt] of Object.entries(loanStatusCounts)) {
    console.log(`  - ${st}: ${cnt} loans`);
  }
  console.log(`Total Active Loan Outstanding: ₹${(totalOutstanding / 100000).toFixed(2)} Lakhs (₹${totalOutstanding.toLocaleString('en-IN')})`);

  console.log(`\nTotal Centers: ${centerTable?.rows.length}`);
  console.log(`Total Collections Recorded: ${tables['Collection']?.rows.length}`);
  console.log(`Total Loan Schedules: ${schedTable?.rows.length}`);

  // 4. DATA INTEGRITY AUDIT
  console.log('\n======================================================');
  console.log('4. DATA INTEGRITY & ANOMALY CHECKS');
  console.log('======================================================');

  // 4a. Negative outstanding loans
  const negativeLoans = loanTable?.rows.filter(r => (parseFloat(r[loanOutIdx]) || 0) < 0) || [];
  console.log(`Negative outstanding loans: ${negativeLoans.length}`);
  for (const l of negativeLoans.slice(0, 5)) {
    console.log(`  ⚠️ Loan ${l[loanNumIdx]}: Outstanding is ${l[loanOutIdx]}`);
  }

  // 4b. Active loans with 0 outstanding
  const activeZeroOut = loanTable?.rows.filter(r => r[loanStatusIdx] === 'ACTIVE' && (parseFloat(r[loanOutIdx]) || 0) <= 0) || [];
  console.log(`Active loans with <= 0 outstanding: ${activeZeroOut.length}`);
  for (const l of activeZeroOut.slice(0, 5)) {
    console.log(`  ⚠️ Loan ${l[loanNumIdx]}: Status is ACTIVE but outstanding is ${l[loanOutIdx]}`);
  }

  // 4c. Closed loans with > 0 outstanding
  const closedWithOut = loanTable?.rows.filter(r => r[loanStatusIdx] === 'CLOSED' && (parseFloat(r[loanOutIdx]) || 0) > 0) || [];
  console.log(`Closed loans with > 0 outstanding: ${closedWithOut.length}`);
  for (const l of closedWithOut.slice(0, 5)) {
    console.log(`  ⚠️ Loan ${l[loanNumIdx]}: Status is CLOSED but outstanding is ${l[loanOutIdx]}`);
  }

  // 4d. Schedule sum vs Loan outstanding mismatch
  let mismatchCount = 0;
  for (const l of loanTable?.rows || []) {
    if (l[loanStatusIdx] !== 'ACTIVE') continue;
    const lId = l[loanIdIdx];
    const reportedOut = Math.round(parseFloat(l[loanOutIdx]) || 0);
    const sched = schedMap.get(lId);
    const computedOut = Math.round(sched?.unpaidSum || 0);
    if (Math.abs(reportedOut - computedOut) > 5) {
      mismatchCount++;
      if (mismatchCount <= 5) {
        console.log(`  ⚠️ Mismatch on ${l[loanNumIdx]}: Loan says ₹${reportedOut}, Schedules say ₹${computedOut} (diff: ₹${reportedOut - computedOut})`);
      }
    }
  }
  console.log(`Schedule vs Loan Outstanding mismatches: ${mismatchCount}`);

  // 4e. Orphan Schedules (schedules where loanId doesn't exist)
  const loanIdSet = new Set(loanTable?.rows.map(r => r[loanIdIdx]));
  const orphanSchedules = schedTable?.rows.filter(r => !loanIdSet.has(r[schLoanIdIdx])) || [];
  console.log(`Orphan schedules (no loan): ${orphanSchedules.length}`);

  // 5. RECENT AUDIT LOGS
  console.log('\n======================================================');
  console.log('5. RECENT AUDIT LOGS (Today)');
  console.log('======================================================');
  const auditTable = tables['AuditLog'];
  const aDateIdx = auditTable?.columns.indexOf('createdAt') ?? -1;
  const aActionIdx = auditTable?.columns.indexOf('action') ?? -1;
  const aEntityIdx = auditTable?.columns.indexOf('entity') ?? -1;
  const aEntityIdIdx = auditTable?.columns.indexOf('entityId') ?? -1;
  const aDetailsIdx = auditTable?.columns.indexOf('details') ?? -1;

  const recentLogs = (auditTable?.rows || [])
    .filter(r => r[aDateIdx] && r[aDateIdx].includes('2026-10-20'))
    .slice(-10);

  console.log(`Total Audit logs on 2026-10-20: ${recentLogs.length}`);
  for (const log of recentLogs) {
    console.log(`  [${log[aDateIdx]}] ${log[aActionIdx]} ${log[aEntityIdx]} (${log[aEntityIdIdx]}): ${log[aDetailsIdx]?.slice(0, 100)}`);
  }
}

parseDump().catch(console.error);
