const ADODB = require('node-adodb');
const connection = ADODB.open('Provider=Microsoft.Jet.OLEDB.4.0;Data Source=D:\\access\\SS\\server\\MAGALIRKULU2.MDB;Jet OLEDB:Database Password=abcsSm;');

async function run() {
  try {
    const tables = await connection.schema(20); // adSchemaTables
    console.log("Tables:");
    for (const t of tables) {
      if (t.TABLE_TYPE === 'TABLE') {
        console.log(`- ${t.TABLE_NAME}`);
      }
    }
  } catch (error) {
    console.error("Error reading schema:", error);
  }
}

run();
