const { Client } = require('ssh2');

const conn = new Client();
const cmd = `
echo "=== INSTANCES IN DB ==="
sqlite3 /opt/cynexvm/backend/prisma/prisma/dev.db "SELECT id, vmid, name, status FROM Instance;"
echo "=== RECENT JOBS ==="
sqlite3 /opt/cynexvm/backend/prisma/prisma/dev.db "SELECT id, type, status, progress, error, createdAt FROM NodeJob ORDER BY createdAt DESC LIMIT 10;"
`;

conn.on('ready', () => {
  conn.exec(cmd, (err, stream) => {
    if (err) {
      console.error('CMD Exec Error:', err);
      conn.end();
      process.exit(1);
    }
    stream.on('close', (code, signal) => {
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).on('error', (err) => {
  console.error('SSH Connection Error:', err);
  process.exit(1);
}).connect({
  host: '100.83.143.84',
  port: 22,
  username: 'root',
  password: 'Aryanop55@'
});
