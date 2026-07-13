const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const logDir = '/var/log/cynexd';

function log(jobId, level, message) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] [job:${jobId}] ${message}`;
  console.log(line);
  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'jobs.log'), line + '\n');
  } catch (_) {}
}

class ContainerService {
  static async create(params) {
    const { vmid, name, osTemplate, cpuCores, memoryMb, storageGb, hostname, password, disks, networkInterfaces } = params;
    const containerName = `cynex-${vmid}`;

    log(params.jobId || '-', 'info', `Creating container ${containerName} from ${osTemplate}`);

    try {
      execSync(`lxc init ${osTemplate} ${containerName}`, { stdio: 'pipe', timeout: 120000 });

      execSync(`lxc config set ${containerName} limits.cpu ${cpuCores || 1}`, { stdio: 'pipe' });
      execSync(`lxc config set ${containerName} limits.memory ${memoryMb || 512}MB`, { stdio: 'pipe' });

      if (password) {
        fs.writeFileSync('/tmp/cloud-init.yml', `#cloud-config\npassword: ${password}\nchpasswd: { expire: False }\nssh_pwauth: true\n`);
        execSync(`lxc config set ${containerName} cloud-init.user-data - < /tmp/cloud-init.yml`, { stdio: 'pipe' });
      }

      execSync(`lxc start ${containerName}`, { stdio: 'pipe', timeout: 60000 });

      let ip = '';
      for (let i = 0; i < 30; i++) {
        try {
          const result = execSync(`lxc list ${containerName} --format json`, { stdio: 'pipe' });
          const data = JSON.parse(result.toString());
          const addrs = data[0]?.state?.network?.eth0?.addresses || [];
          const ipv4 = addrs.find(a => a.family === 'inet');
          if (ipv4) { ip = ipv4.address; break; }
        } catch (_) {}
        await new Promise(r => setTimeout(r, 2000));
      }

      return { success: true, containerName, ip, vmid };
    } catch (err) {
      log(params.jobId || '-', 'error', `Create failed: ${err.message}`);
      try { execSync(`lxc delete -f ${containerName}`, { stdio: 'pipe' }); } catch (_) {}
      throw err;
    }
  }

  static execCommand(containerName, command) {
    const result = execSync(`lxc exec ${containerName} -- ${command}`, {
      stdio: 'pipe', timeout: 30000, maxBuffer: 1024 * 1024
    });
    return result.toString();
  }

  static start(containerName) {
    execSync(`lxc start ${containerName}`, { stdio: 'pipe', timeout: 30000 });
  }

  static stop(containerName) {
    execSync(`lxc stop ${containerName}`, { stdio: 'pipe', timeout: 30000 });
  }

  static restart(containerName) {
    execSync(`lxc restart ${containerName}`, { stdio: 'pipe', timeout: 60000 });
  }

  static forceStop(containerName) {
    execSync(`lxc stop -f ${containerName}`, { stdio: 'pipe', timeout: 15000 });
  }

  static pause(containerName) {
    execSync(`lxc pause ${containerName}`, { stdio: 'pipe', timeout: 15000 });
  }

  static resume(containerName) {
    execSync(`lxc resume ${containerName}`, { stdio: 'pipe', timeout: 15000 });
  }

  static delete(containerName) {
    execSync(`lxc delete -f ${containerName}`, { stdio: 'pipe', timeout: 30000 });
  }

  static snapshot(containerName, name) {
    execSync(`lxc snapshot ${containerName} ${name}`, { stdio: 'pipe', timeout: 60000 });
  }

  static restore(containerName, name) {
    execSync(`lxc restore ${containerName} ${name}`, { stdio: 'pipe', timeout: 120000 });
  }

  static deleteSnapshot(containerName, name) {
    execSync(`lxc delete ${containerName}/${name}`, { stdio: 'pipe', timeout: 30000 });
  }

  static resizeCPU(containerName, cores) {
    execSync(`lxc config set ${containerName} limits.cpu ${cores}`, { stdio: 'pipe' });
  }

  static resizeMemory(containerName, mb) {
    execSync(`lxc config set ${containerName} limits.memory ${mb}MB`, { stdio: 'pipe' });
  }

  static resizeDisk(containerName, gb) {
    execSync(`lxc config device set ${containerName} root size ${gb}GB`, { stdio: 'pipe', timeout: 30000 });
  }

  static reinstall(containerName, osTemplate) {
    this.delete(containerName);
    execSync(`lxc init ${osTemplate} ${containerName}`, { stdio: 'pipe', timeout: 120000 });
    this.start(containerName);
  }

  static clone(sourceContainerName, newName) {
    execSync(`lxc copy ${sourceContainerName} ${newName}`, { stdio: 'pipe', timeout: 120000 });
  }

  static rename(containerName, newName) {
    execSync(`lxc move ${containerName} ${newName}`, { stdio: 'pipe', timeout: 60000 });
  }

  static getInfo(containerName) {
    const raw = execSync(`lxc list ${containerName} --format json`, { stdio: 'pipe' });
    const data = JSON.parse(raw.toString());
    return data[0] || null;
  }

  static listAll() {
    const raw = execSync('lxc list --format json', { stdio: 'pipe', maxBuffer: 1024 * 1024 });
    return JSON.parse(raw.toString());
  }
}

module.exports = ContainerService;
