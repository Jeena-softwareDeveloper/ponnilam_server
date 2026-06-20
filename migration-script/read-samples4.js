const ADODB = require('node-adodb');
const connection = ADODB.open('Provider=Microsoft.Jet.OLEDB.4.0;Data Source=D:\\access\\SS\\server\\MAGALIRKULU2.MDB;Jet OLEDB:Database Password=abcsSm;');

const tables = ['TrnChit_Receipt1', 'TrnPayment', 'TrnReceipt'];

async function run() {
  for (const table of tables) {
    try {
      const data = await connection.query(`SELECT TOP 1 * FROM [${table}]`);
      console.log(`\n--- ${table} ---`);
      if (data.length > 0) {
        console.log(JSON.stringify(data[0], null, 2));
      } else {
        console.log("No data");
      }
    } catch (e) {
      console.error(`Error reading ${table}:`, e.message);
    }
  }
}

run();
