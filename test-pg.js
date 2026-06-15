const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://test1:123@31.97.226.197:5432/test1?schema=public'
});

async function testConnection() {
  try {
    console.log('Connecting to database...');
    await client.connect();
    const res = await client.query('SELECT NOW() as current_time');
    console.log('✅ Success! Connected to aaPanel PostgreSQL Database.');
    console.log('Server Time:', res.rows[0].current_time);
  } catch (err) {
    console.error('❌ Connection Error:', err.message);
  } finally {
    await client.end();
  }
}

testConnection();
