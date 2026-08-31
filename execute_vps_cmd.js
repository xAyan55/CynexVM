const { Client } = require('ssh2');

const conn = new Client();
const cmd = `
echo "=== SETTING WAL MODE ON ALL SQLITE DATABASES ==="
sqlite3 /opt/cynexvm/backend/prisma/prisma/dev.db "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000;"
sqlite3 /opt/cynexvm/backend/prisma/dev.db "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000;" 2>/dev/null || true

echo "=== TESTING LXC EXEC ON CYNEX-101 ==="
/snap/bin/lxc exec cynex-101 -- whoami
/snap/bin/lxc exec cynex-101 -- uptime
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
  password: 'Aryanop55@',
  readyTimeout: 30000
});
