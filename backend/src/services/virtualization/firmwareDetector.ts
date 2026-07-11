import { NodeClient } from './nodeClient';

export interface FirmwareFile {
  path: string;
  variant: 'code' | 'vars';
  type: 'ovmf' | 'secureboot';
}

export interface FirmwareDetectionResult {
  available: boolean;
  files: FirmwareFile[];
  uefi: { available: boolean; codePath: string | null; varsPath: string | null };
  secureBoot: { available: boolean; codePath: string | null; varsPath: string | null };
  seaBios: { available: boolean };
  qemuInstalled: boolean;
  libvirtInstalled: boolean;
  distro: string | null;
  packageHint: string | null;
}

const OVMF_SEARCH_PATHS = [
  '/usr/share/OVMF',
  '/usr/share/OVMF/x64',
  '/usr/share/edk2/x64',
  '/usr/share/edk2/ovmf',
  '/usr/share/qemu',
];

const OVMF_CODE_CANDIDATES = ['OVMF_CODE.fd', 'ovmf-code-x86_64.fd', 'OVMF_CODE_4M.fd'];
const OVMF_VARS_CANDIDATES = ['OVMF_VARS.fd', 'ovmf-vars-x86_64.fd', 'OVMF_VARS_4M.fd'];
const SECUREBOOT_CODE_CANDIDATES = ['OVMF_CODE.secboot.fd', 'ovmf-code-x86_64-secure-boot.fd'];
const SECUREBOOT_VARS_CANDIDATES = ['OVMF_VARS.ms.fd', 'ovmf-vars-x86_64-ms.fd'];

const DISTRO_PACKAGE_HINTS: Record<string, string> = {
  ubuntu: 'sudo apt install ovmf qemu-system-x86',
  debian: 'sudo apt install ovmf qemu-system-x86',
  'rhel': 'sudo dnf install edk2-ovmf qemu-kvm',
  'centos': 'sudo dnf install edk2-ovmf qemu-kvm',
  'fedora': 'sudo dnf install edk2-ovmf qemu-kvm',
  'arch': 'sudo pacman -S edk2-ovmf qemu',
  'opensuse': 'sudo zypper install qemu-ovmf-x86_64 qemu-kvm',
  'alpine': 'sudo apk add ovmf qemu-system-x86_64',
  'rocky': 'sudo dnf install edk2-ovmf qemu-kvm',
  'almalinux': 'sudo dnf install edk2-ovmf qemu-kvm',
  'sles': 'sudo zypper install qemu-ovmf-x86_64 qemu-kvm',
};

const FIRMWARE_DETECTION_SCRIPT = [
  'check_file() { local p="$1" k="$2"; if [ -f "$p" ]; then echo "FOUND:$k=$p"; fi; }',
  // Search OVMF paths
  'for base in /usr/share/OVMF /usr/share/OVMF/x64 /usr/share/edk2/x64 /usr/share/edk2/ovmf /usr/share/qemu; do',
  '  for c in OVMF_CODE.fd ovmf-code-x86_64.fd OVMF_CODE_4M.fd; do check_file "$base/$c" uefi_code; done',
  '  for c in OVMF_VARS.fd ovmf-vars-x86_64.fd OVMF_VARS_4M.fd; do check_file "$base/$c" uefi_vars; done',
  '  for c in OVMF_CODE.secboot.fd ovmf-code-x86_64-secure-boot.fd; do check_file "$base/$c" secureboot_code; done',
  '  for c in OVMF_VARS.ms.fd ovmf-vars-x86_64-ms.fd; do check_file "$base/$c" secureboot_vars; done',
  'done',
  // Check qemu
  'command -v qemu-system-x86_64 >/dev/null 2>&1 && echo "FOUND:qemu_installed=true"',
  // Check virsh
  'command -v virsh >/dev/null 2>&1 && echo "FOUND:libvirt_installed=true"',
  // Detect distro
  'if [ -f /etc/os-release ]; then . /etc/os-release; echo "FOUND:distro=$ID";',
  'elif [ -f /etc/redhat-release ]; then echo "FOUND:distro=rhel"; fi',
].join('\n');

export class FirmwareDetector {
  /**
   * Runs firmware detection on a node via shell script.
   * Returns structured info about available firmware files.
   */
  public static async detect(nodeId: string): Promise<FirmwareDetectionResult> {
    const result: FirmwareDetectionResult = {
      available: false,
      files: [],
      uefi: { available: false, codePath: null, varsPath: null },
      secureBoot: { available: false, codePath: null, varsPath: null },
      seaBios: { available: false },
      qemuInstalled: false,
      libvirtInstalled: false,
      distro: null,
      packageHint: null,
    };

    const res = await NodeClient.executeCommand(nodeId, FIRMWARE_DETECTION_SCRIPT);

    if (res.exitCode !== 0) {
      // Non-zero exit is common since test -f returns non-zero for missing files
      // The script's echo statements will still produce output
    }

    const lines = res.stdout.split('\n').filter(l => l.startsWith('FOUND:'));
    const data: Record<string, string> = {};

    for (const line of lines) {
      const kv = line.replace('FOUND:', '').split('=', 2);
      if (kv.length === 2) {
        data[kv[0]] = kv[1];
      }
    }

    // Parse results
    result.qemuInstalled = data['qemu_installed'] === 'true';
    result.libvirtInstalled = data['libvirt_installed'] === 'true';
    result.distro = data['distro'] || null;

    if (result.distro && DISTRO_PACKAGE_HINTS[result.distro]) {
      result.packageHint = DISTRO_PACKAGE_HINTS[result.distro];
    } else if (result.distro) {
      result.packageHint = `Install OVMF package for ${result.distro} (e.g. edk2-ovmf or ovmf)`;
    }

    // UEFI firmware
    if (data['uefi_code']) {
      result.uefi.codePath = data['uefi_code'];
      result.files.push({ path: data['uefi_code'], variant: 'code', type: 'ovmf' });
    }
    if (data['uefi_vars']) {
      result.uefi.varsPath = data['uefi_vars'];
      result.files.push({ path: data['uefi_vars'], variant: 'vars', type: 'ovmf' });
    }

    // SecureBoot firmware
    if (data['secureboot_code']) {
      result.secureBoot.codePath = data['secureboot_code'];
      result.files.push({ path: data['secureboot_code'], variant: 'code', type: 'secureboot' });
    }
    if (data['secureboot_vars']) {
      result.secureBoot.varsPath = data['secureboot_vars'];
      result.files.push({ path: data['secureboot_vars'], variant: 'vars', type: 'secureboot' });
    }

    // SeaBIOS is always available in QEMU (built-in), but check if we can find it
    result.seaBios.available = true; // QEMU always has SeaBIOS fallback

    // UEFI is available if we have both CODE and VARS
    result.uefi.available = !!(result.uefi.codePath && result.uefi.varsPath);
    result.secureBoot.available = !!(result.secureBoot.codePath && result.secureBoot.varsPath);
    result.available = result.uefi.available || result.seaBios.available;

    return result;
  }

  /**
   * Validates that the requested firmware type is available on the node.
   * Throws a descriptive error if not.
   */
  public static async validateFirmware(
    nodeId: string,
    requestedUefi: boolean,
    autoFallback: boolean
  ): Promise<{ firmwareType: 'uefi' | 'seabios'; codePath?: string; varsPath?: string }> {
    const firmware = await FirmwareDetector.detect(nodeId);

    if (!requestedUefi) {
      // Legacy BIOS requested - no firmware validation needed
      return { firmwareType: 'seabios' };
    }

    if (firmware.uefi.available) {
      return {
        firmwareType: 'uefi',
        codePath: firmware.uefi.codePath!,
        varsPath: firmware.uefi.varsPath!,
      };
    }

    if (autoFallback) {
      return { firmwareType: 'seabios' };
    }

    const hint = firmware.packageHint
      ? ` Install OVMF: ${firmware.packageHint}`
      : ' Install the OVMF (UEFI) firmware package for your distribution.';

    throw new Error(
      `UEFI firmware (OVMF) is not installed on this node.${hint}`
    );
  }

  /**
   * Runs a comprehensive host validation on the node.
   */
  public static async validateNode(nodeId: string): Promise<{
    status: 'passed' | 'failed' | 'warning';
    checks: { name: string; status: 'pass' | 'fail' | 'warn'; message: string }[];
    firmware: FirmwareDetectionResult;
  }> {
    const firmware = await FirmwareDetector.detect(nodeId);
    const checks: { name: string; status: 'pass' | 'fail' | 'warn'; message: string }[] = [];

    // 1. QEMU installed
    checks.push({
      name: 'qemu-system-x86_64',
      status: firmware.qemuInstalled ? 'pass' : 'fail',
      message: firmware.qemuInstalled
        ? 'QEMU system emulator is installed'
        : 'qemu-system-x86_64 is not installed. Install with: sudo apt install qemu-system-x86',
    });

    // 2. libvirt installed
    checks.push({
      name: 'libvirt (virsh)',
      status: firmware.libvirtInstalled ? 'pass' : 'fail',
      message: firmware.libvirtInstalled
        ? 'libvirt client (virsh) is available'
        : 'virsh is not available. Install with: sudo apt install libvirt-clients',
    });

    // 3. UEFI firmware
    checks.push({
      name: 'UEFI (OVMF) firmware',
      status: firmware.uefi.available ? 'pass' : 'warn',
      message: firmware.uefi.available
        ? `OVMF UEFI firmware detected: ${firmware.uefi.codePath}`
        : `UEFI firmware (OVMF) not found. ${firmware.packageHint || 'UEFI boot will be unavailable.'}`,
    });

    // 4. SecureBoot firmware
    checks.push({
      name: 'SecureBoot firmware',
      status: firmware.secureBoot.available ? 'pass' : 'warn',
      message: firmware.secureBoot.available
        ? `SecureBoot firmware detected: ${firmware.secureBoot.codePath}`
        : 'SecureBoot firmware not found. SecureBoot will be unavailable.',
    });

    // 5. SeaBIOS
    checks.push({
      name: 'SeaBIOS (legacy BIOS)',
      status: 'pass',
      message: 'SeaBIOS is built into QEMU and available for legacy BIOS boot.',
    });

    // 6. KVM availability
    try {
      const kvmRes = await NodeClient.executeCommand(nodeId,
        '[ -c /dev/kvm ] && echo "yes" || echo "no"'
      );
      checks.push({
        name: 'KVM acceleration',
        status: kvmRes.stdout.trim() === 'yes' ? 'pass' : 'warn',
        message: kvmRes.stdout.trim() === 'yes'
          ? '/dev/kvm is available (hardware acceleration)'
          : '/dev/kvm not found. VMs will run without hardware acceleration (emulated).',
      });
    } catch {
      checks.push({
        name: 'KVM acceleration',
        status: 'warn',
        message: 'Could not check /dev/kvm. Assuming emulated mode.',
      });
    }

    // 7. libvirtd service
    try {
      const libvirtRes = await NodeClient.executeCommand(nodeId,
        'systemctl is-active libvirtd 2>/dev/null || echo "inactive"'
      );
      checks.push({
        name: 'libvirtd service',
        status: libvirtRes.stdout.trim() === 'active' ? 'pass' : 'fail',
        message: libvirtRes.stdout.trim() === 'active'
          ? 'libvirtd service is running'
          : 'libvirtd service is not running. Start with: sudo systemctl start libvirtd',
      });
    } catch {
      checks.push({
        name: 'libvirtd service',
        status: 'warn',
        message: 'Could not check libvirtd service status.',
      });
    }

    const hasFail = checks.some(c => c.status === 'fail');
    return {
      status: hasFail ? 'failed' : 'passed',
      checks,
      firmware,
    };
  }
}
