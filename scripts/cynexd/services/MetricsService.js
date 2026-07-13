const { execSync } = require('child_process');
const os = require('os');

class MetricsService {
  static collect() {
    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 ? cpus[0].model : 'unknown';
    const cpuCores = cpus.length;

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMemMb = Math.round((totalMem - freeMem) / 1024 / 1024);
    const totalMemMb = Math.round(totalMem / 1024 / 1024);

    let diskGb = 0;
    try {
      const df = execSync('df -BG / | awk \'NR==2{print $2}\'', { stdio: 'pipe' });
      diskGb = parseInt(df.toString().trim().replace('G', ''), 10) || 0;
    } catch (_) {}

    let rxBytes = 0, txBytes = 0;
    try {
      const netStat = execSync("cat /proc/net/dev | awk 'NR>2 {rx+=$2; tx+=$10} END {print rx, tx}'", { stdio: 'pipe' });
      const parts = netStat.toString().trim().split(' ');
      rxBytes = parseInt(parts[0], 10) || 0;
      txBytes = parseInt(parts[1], 10) || 0;
    } catch (_) {}

    let containerCount = 0;
    try {
      const list = execSync('lxc list --format json', { stdio: 'pipe', maxBuffer: 1024 * 1024 });
      containerCount = JSON.parse(list.toString()).length;
    } catch (_) {}

    const loadAvg = os.loadavg()[0];

    let uptime = 0;
    try {
      uptime = Math.floor(parseInt(execSync('cat /proc/uptime', { stdio: 'pipe' }).toString().split('.')[0], 10) / 60);
    } catch (_) {}

    let kernel = '';
    try { kernel = execSync('uname -r', { stdio: 'pipe' }).toString().trim(); } catch (_) {}

    let osName = '';
    try {
      if (os.platform() === 'linux') {
        const data = execSync('cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\'', { stdio: 'pipe' });
        osName = data.toString().trim();
      }
    } catch (_) {}
    if (!osName) osName = `${os.type()} ${os.release()}`;

    let lxdVersion = '';
    try { lxdVersion = execSync('lxd version 2>/dev/null || lxc version 2>/dev/null', { stdio: 'pipe' }).toString().trim().split('\n')[0]; } catch (_) {}

    return {
      cpuPct: 0,
      ramMb: usedMemMb,
      totalRamMb: totalMemMb,
      diskGb,
      rxBytes,
      txBytes,
      loadAvg,
      containerCount,
      cpuCores,
      cpuModel,
      uptime,
      kernel,
      osName,
      lxdVersion,
      agentVersion: '3.0.0',
      panelVersion: '',
      latency: 0,
    };
  }
}

module.exports = MetricsService;
