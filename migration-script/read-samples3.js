const ADODB = require('node-adodb');
const connection = ADODB.open('Provider=Microsoft.Jet.OLEDB.4.0;Data Source=D:\\access\\SS\\server\\MAGALIRKULU2.MDB;Jet OLEDB:Database Password=abcsSm;');

async function run() {
  try {
    const data = await connection.query(`SELECT * FROM [AccMasGroup]`);
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`Error reading AccMasGroup:`, e.message);
  }
}

run();
