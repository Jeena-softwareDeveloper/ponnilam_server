const { Client } = require('ssh2');

const conn = new Client();

const commands = [
  // Find the exact path for pg_hba.conf and postgresql.conf
  `PG_DATA_DIR=$(find /www/server/pgsql /var/lib/pgsql /etc/postgresql -name "pg_hba.conf" 2>/dev/null | head -n 1 | xargs dirname)`,
  
  // If found, update the configuration
  `if [ -n "$PG_DATA_DIR" ]; then
    echo "Found PG config at: $PG_DATA_DIR"
    
    # Allow listen_addresses = '*'
    sed -i "s/^#listen_addresses = 'localhost'/listen_addresses = '*'/g" $PG_DATA_DIR/postgresql.conf
    sed -i "s/^listen_addresses = 'localhost'/listen_addresses = '*'/g" $PG_DATA_DIR/postgresql.conf
    
    # Check if host all all 0.0.0.0/0 md5 already exists, if not, add it
    grep -q "host all all 0.0.0.0/0" $PG_DATA_DIR/pg_hba.conf || echo "host    all             all             0.0.0.0/0               md5" >> $PG_DATA_DIR/pg_hba.conf
    
    echo "Configuration updated successfully."
    
    # Restart Postgres
    systemctl restart postgresql || /etc/init.d/pgsql restart || systemctl restart pgsql
    
    echo "Postgres restarted successfully!"
  else
    echo "Could not find postgresql configuration."
  fi`,
  
  // Additionally, ensure UFW/firewall allows port 5432 just in case aaPanel missed the system firewall
  `ufw allow 5432/tcp 2>/dev/null || firewall-cmd --zone=public --add-port=5432/tcp --permanent 2>/dev/null && firewall-cmd --reload 2>/dev/null || iptables -A INPUT -p tcp --dport 5432 -j ACCEPT 2>/dev/null`
];

conn.on('ready', () => {
  console.log('✅ SSH Client :: READY. Connected to VPS.');
  
  conn.exec(commands.join('\n'), (err, stream) => {
    if (err) throw err;
    
    stream.on('close', (code, signal) => {
      console.log('✅ SSH Connection closed.');
      conn.end();
    }).on('data', (data) => {
      console.log('VPS OUTPUT: ' + data);
    }).stderr.on('data', (data) => {
      console.error('VPS ERROR: ' + data);
    });
  });
}).connect({
  host: '31.97.226.197',
  port: 22,
  username: 'root',
  password: 'Jeen@9344193569@2003'
});

conn.on('error', (err) => {
  console.error('❌ SSH Connection Error:', err.message);
});
