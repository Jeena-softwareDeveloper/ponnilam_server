const fs = require('fs');
const readline = require('readline');

async function checkCustLedgers() {
  const fileStream = fs.createReadStream('c:/Users/HP/Documents/ponnilam/ponnilam_server/ponnilamfincorp_2026-10-19_12-27-35_pgsql_data.sql');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const colIds = [
    '3758d253-9219-4eca-b177-ae5d44f54dc4',
    '4dce122c-fda0-4482-a3c5-5541a43918f2',
    '7c884c39-313d-478a-8874-98c93b29eb58',
    '174868c4-442d-4e2a-903e-add91cc5ab24',
    '190abe1e-4740-4873-b0d5-b97f86041dfb',
  ];

  let inCustLedger = false;
  const custLedgers = [];

  for await (const line of rl) {
    if (line.includes('COPY public."CustomerLedger"')) inCustLedger = true;
    else if (inCustLedger && line.startsWith('\\.')) inCustLedger = false;
    else if (inCustLedger) {
      for (const id of colIds) {
        if (line.includes(id)) {
          const p = line.split('\t');
          custLedgers.push({ id: p[0], date: p[1], type: p[2], amt: p[3], open: p[4], close: p[5], remarks: p[6], custId: p[7], colId: p[8] });
        }
      }
    }
  }

  console.log('--- CustomerLedger entries for these 5 collections:');
  custLedgers.forEach(c => {
    console.log(c.id, c.date, c.type, 'Amt:', c.amt, 'Open:', c.open, 'Close:', c.close, c.remarks, 'colId:', c.colId);
  });
}

checkCustLedgers();
