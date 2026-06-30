export interface ProvisioningConfig {
  hostname: string;
  password?: string;
  sshKeys?: string[];
  timezone?: string;
  locale?: string;
  startupScripts?: string[];
  packages?: string[];
}

export class ProvisioningEngine {
  /**
   * Generates a standard cloud-init cloud-config YAML template configuration string
   */
  public static generateCloudConfig(config: ProvisioningConfig): string {
    const lines: string[] = ['#cloud-config'];

    // SSH Password authentication enable
    lines.push('ssh_pwauth: true');

    // Timezone
    lines.push(`timezone: ${config.timezone || 'UTC'}`);

    // Locale
    lines.push(`locale: ${config.locale || 'en_US.UTF-8'}`);

    // Password configuration
    if (config.password) {
      lines.push('chpasswd:');
      lines.push('  list: |');
      lines.push(`    root:${config.password}`);
      lines.push('  expire: False');
    }

    // SSH Keys injection
    if (config.sshKeys && config.sshKeys.length > 0) {
      lines.push('users:');
      lines.push('  - name: root');
      lines.push('    ssh_authorized_keys:');
      for (const key of config.sshKeys) {
        lines.push(`      - "${key}"`);
      }
    }

    // Packages to install on boot
    if (config.packages && config.packages.length > 0) {
      lines.push('packages:');
      for (const pkg of config.packages) {
        lines.push(`  - ${pkg}`);
      }
    }

    // Run command on first-boot scripts
    const runcmds: string[] = [];
    runcmds.push(`hostnamectl set-hostname ${config.hostname}`);
    runcmds.push('systemctl restart sshd || systemctl restart ssh || true');

    if (config.startupScripts && config.startupScripts.length > 0) {
      for (const cmd of config.startupScripts) {
        runcmds.push(cmd);
      }
    }

    lines.push('runcmd:');
    for (const cmd of runcmds) {
      lines.push(`  - ${cmd}`);
    }

    return lines.join('\n');
  }
}
