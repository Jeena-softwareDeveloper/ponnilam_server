const ADODB = require('node-adodb');
const connection = ADODB.open('Provider=Microsoft.Jet.OLEDB.4.0;Data Source=D:\\access\\SS\\server\\MAGALIRKULU2.MDB;Jet OLEDB:Database Password=abcsSm;');

async function run() {
  try {
    const data = await connection.query(`SELECT TOP 1 * FROM [TrnChit_Receipt2]`);
    console.log(`\n--- TrnChit_Receipt2 ---`);
    console.log(JSON.stringify(data[0], null, 2));
  } catch (e) {
    console.error(`Error reading TrnChit_Receipt2:`, e.message);
  }
}

run();
