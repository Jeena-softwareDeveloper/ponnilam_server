import * as ADODB from 'node-adodb';

// Configure node-adodb to use 32-bit if needed, usually on Windows ADODB works out of the box with the Jet OLEDB provider
const connection = ADODB.open(`Provider=Microsoft.Jet.OLEDB.4.0;Data Source=C:\\Users\\HP\\Documents\\ponnilam\\ponnilam_server\\MAGALIRKULU2.MDB;`);

async function checkTables() {
  try {
    const tables: any = await connection.schema(20); // 20 is the schema enum for Tables
    console.log("Tables in database:");
    for (const t of tables) {
      if (t.TABLE_TYPE === 'TABLE') {
        console.log(`- ${t.TABLE_NAME}`);
      }
    }
  } catch (error) {
    console.error(error);
  }
}

checkTables();
