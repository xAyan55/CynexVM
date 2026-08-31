const { Client } = require('ssh2');

const conn = new Client();
const cmd = `lxc init ubuntu:22.04 test-test; lxc delete test-test --force || true`;

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
