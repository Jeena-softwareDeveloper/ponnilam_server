const fs = require('fs');
const readline = require('readline');

async function testAll() {
  const fileStream = fs.createReadStream('c:/Users/HP/Documents/ponnilam/ponnilam_server/ponnilamfincorp_2026-10-19_12-27-35_pgsql_data.sql');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const loanIds = {
    'e27da04e-d535-497a-9bf1-8a99b49c0cc0': 'SAT-L0252 (SCA001)',
    '811fe673-b5fa-4ddd-bfa8-264e0b1bb1c2': 'SAT-L0253 (SCA002)',
    '235dec22-b67c-4c0e-89aa-d011f8a77b3d': 'SAT-L0254 (SCA003)',
    '2c44eb38-9f64-49c0-9d21-c47ca2467e70': 'SAT-L0255 (SCA004)',
    'd2cdae9f-ba37-4a7b-88e3-835e2da8addc': 'SAT-L0256 (SCA005)',
  };

  let inSched = false;
  const scheds = {};
  for (const id of Object.keys(loanIds)) scheds[id] = [];

  for await (const line of rl) {
    if (line.includes('COPY public."LoanSchedule"')) inSched = true;
    else if (inSched && line.startsWith('\\.')) inSched = false;
    else if (inSched) {
      for (const id of Object.keys(loanIds)) {
        if (line.includes(id)) {
          const p = line.split('\t');
          scheds[id].push({ id: p[0], dueDate: p[1], emi: p[2], paid: p[3], status: p[4], paidDate: p[5], colId: p[7] });
        }
      }
    }
  }

  for (const [id, name] of Object.entries(loanIds)) {
    scheds[id].sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate));
    console.log('\n---', name);
    scheds[id].slice(17).forEach((s, idx) => {
      console.log('Week', idx + 18, s.dueDate.substring(0, 10), s.status, 'Paid:', s.paid, 'colId:', s.colId);
    });
  }
}
testAll();
