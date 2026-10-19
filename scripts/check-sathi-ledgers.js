const fs = require('fs');
const readline = require('readline');

async function checkLedgers() {
  const fileStream = fs.createReadStream('c:/Users/HP/Documents/ponnilam/ponnilam_server/ponnilamfincorp_2026-10-19_12-27-35_pgsql_data.sql');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const loanIds = [
    'e27da04e-d535-497a-9bf1-8a99b49c0cc0', // SAT-L0252
    '811fe673-b5fa-4ddd-bfa8-264e0b1bb1c2', // SAT-L0253
    '235dec22-b67c-4c0e-89aa-d011f8a77b3d', // SAT-L0254
    '2c44eb38-9f64-49c0-9d21-c47ca2467e70', // SAT-L0255
    'd2cdae9f-ba37-4a7b-88e3-835e2da8addc', // SAT-L0256
  ];

  let inLoanLedger = false;
  const loanLedgers = [];

  for await (const line of rl) {
    if (line.includes('COPY public."LoanLedger"')) inLoanLedger = true;
    else if (inLoanLedger && line.startsWith('\\.')) inLoanLedger = false;
    else if (inLoanLedger) {
      for (const id of loanIds) {
        if (line.includes(id)) {
          const p = line.split('\t');
          loanLedgers.push({ id: p[0], date: p[1], type: p[2], amt: p[3], open: p[4], close: p[5], remarks: p[6], loanId: p[7], colId: p[8] });
        }
      }
    }
  }

  console.log('--- LoanLedger entries count:', loanLedgers.length);
  loanLedgers.forEach(l => {
    if (l.type === 'Pre-Close' || l.date.includes('2026-10-1')) {
      console.log(l.loanId.substring(0, 8), l.date, l.type, 'Amt:', l.amt, 'Open:', l.open, 'Close:', l.close, l.remarks, 'colId:', l.colId);
    }
  });
}

checkLedgers();
