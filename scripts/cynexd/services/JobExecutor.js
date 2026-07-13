const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const logDir = '/var/log/cynexd';

class JobExecutor {
  constructor(sendCallback, containerService, terminalService) {
    this.send = sendCallback;
    this.container = containerService;
    this.terminal = terminalService;
    this.queue = [];
    this.running = false;
    this.currentJob = null;
    this.logDir = logDir;
  }

  enqueue(job) {
    this.queue.push(job);
    if (!this.running) this.processNext();
  }

  cancel(jobId) {
    this.queue = this.queue.filter(j => j.jobId !== jobId);
    if (this.currentJob && this.currentJob.jobId === jobId) {
      this.send('job_cancelled', { jobId });
      this.currentJob = null;
      this.running = false;
      this.processNext();
    }
  }

  async processNext() {
    if (this.running || this.queue.length === 0) return;
    this.running = true;
    this.currentJob = this.queue.shift();

    try {
      await this.execute(this.currentJob);
    } catch (err) {
      this.send('job_failed', {
        jobId: this.currentJob.jobId,
        error: err.message,
        exitCode: err.code || 1
      });
    }

    this.running = false;
    this.currentJob = null;
    this.processNext();
  }

  async execute(job) {
    const { jobId, jobType, payload } = job;

    switch (jobType) {
      case 'deploy':
        await this.deploy(jobId, payload);
        break;
      case 'start':
        this.container.start(payload.containerName);
        this.send('job_complete', { jobId, exitCode: 0, duration: 0 });
        break;
      case 'stop':
        this.container.stop(payload.containerName);
        this.send('job_complete', { jobId, exitCode: 0, duration: 0 });
        break;
      case 'restart':
        this.container.restart(payload.containerName);
        this.send('job_complete', { jobId, exitCode: 0, duration: 0 });
        break;
      case 'force_stop':
        this.container.forceStop(payload.containerName);
        this.send('job_complete', { jobId, exitCode: 0, duration: 0 });
        break;
      case 'pause':
        this.container.pause(payload.containerName);
        this.send('job_complete', { jobId, exitCode: 0, duration: 0 });
        break;
      case 'resume':
        this.container.resume(payload.containerName);
        this.send('job_complete', { jobId, exitCode: 0, duration: 0 });
        break;
      case 'delete':
        this.container.delete(payload.containerName);
        this.send('job_complete', { jobId, exitCode: 0, duration: 0 });
        break;
      case 'reinstall':
        this.container.reinstall(payload.containerName, payload.osTemplate);
        this.send('job_complete', { jobId, exitCode: 0, duration: 0 });
        break;
      case 'snapshot':
        this.container.snapshot(payload.containerName, payload.snapshotName);
        this.send('job_complete', { jobId, exitCode: 0, duration: 0 });
        break;
      case 'snapshot_restore':
        this.container.restore(payload.containerName, payload.snapshotName);
        this.send('job_complete', { jobId, exitCode: 0, duration: 0 });
        break;
      case 'snapshot_delete':
        this.container.deleteSnapshot(payload.containerName, payload.snapshotName);
        this.send('job_complete', { jobId, exitCode: 0, duration: 0 });
        break;
      case 'resize_cpu':
        this.container.resizeCPU(payload.containerName, payload.cores);
        this.send('job_complete', { jobId, exitCode: 0, duration: 0 });
        break;
      case 'resize_ram':
        this.container.resizeMemory(payload.containerName, payload.mb);
        this.send('job_complete', { jobId, exitCode: 0, duration: 0 });
        break;
      case 'resize_disk':
        this.container.resizeDisk(payload.containerName, payload.gb);
        this.send('job_complete', { jobId, exitCode: 0, duration: 0 });
        break;
      case 'exec_command':
        const output = this.container.execCommand(payload.containerName, payload.command);
        this.send('job_stdout', { jobId, data: output });
        this.send('job_complete', { jobId, exitCode: 0, duration: 0 });
        break;
      case 'clone':
        this.container.clone(payload.containerName, payload.newName);
        this.send('job_complete', { jobId, exitCode: 0, duration: 0 });
        break;
      case 'rename':
        this.container.rename(payload.containerName, payload.newName);
        this.send('job_complete', { jobId, exitCode: 0, duration: 0 });
        break;
      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }
  }

  async deploy(jobId, payload) {
    const send = (type, extra) => this.send(type, { jobId, ...extra });

    send('job_progress', { progress: 5, stage: 'Validating', message: 'Validating deployment parameters...' });

    const { vmid, name, osTemplate, cpuCores, memoryMb, storageGb, hostname, password } = payload;
    const containerName = `cynex-${vmid}`;

    send('job_progress', { progress: 15, stage: 'Downloading image', message: `Pulling ${osTemplate}...` });
    const { execSync } = require('child_process');
    execSync(`lxc init ${osTemplate} ${containerName}`, { stdio: 'pipe', timeout: 120000 });

    send('job_progress', { progress: 30, stage: 'Creating container', message: 'Configuring container...' });
    execSync(`lxc config set ${containerName} limits.cpu ${cpuCores || 1}`, { stdio: 'pipe' });
    execSync(`lxc config set ${containerName} limits.memory ${memoryMb || 512}MB`, { stdio: 'pipe' });

    send('job_progress', { progress: 45, stage: 'Applying limits', message: 'Setting resource limits...' });

    if (password) {
      send('job_progress', { progress: 55, stage: 'Cloud-init', message: 'Applying cloud-init configuration...' });
      const fs = require('fs');
      fs.writeFileSync('/tmp/cloud-init.yml', `#cloud-config\npassword: ${password}\nchpasswd: { expire: False }\nssh_pwauth: true\n`);
      execSync(`lxc config set ${containerName} cloud-init.user-data - < /tmp/cloud-init.yml`, { stdio: 'pipe' });
    }

    send('job_progress', { progress: 65, stage: 'Starting', message: 'Starting container...' });
    execSync(`lxc start ${containerName}`, { stdio: 'pipe', timeout: 60000 });

    send('job_progress', { progress: 80, stage: 'Waiting for IP', message: 'Obtaining IP address...' });
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

    send('job_progress', { progress: 95, stage: 'Finalizing', message: `IP: ${ip || 'dhcp'}` });

    send('job_stdout', { data: JSON.stringify({ containerName, ip, vmid }) });
    send('job_complete', { jobId, exitCode: 0, duration: 0, result: { containerName, ip, vmid } });
  }

  getQueueLength() {
    return this.queue.length;
  }

  isRunning() {
    return this.running;
  }
}

module.exports = JobExecutor;
