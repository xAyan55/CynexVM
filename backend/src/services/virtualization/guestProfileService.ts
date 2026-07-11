export interface GuestProfile {
  guestType: 'Linux' | 'Windows' | 'BSD' | 'Unknown';
  distribution: string;
  supportsCloudInit: boolean;
  supportsGuestAgent: boolean;
  supportsSnapshots: boolean;
  supportsPasswordReset: boolean;
  supportsSerialRepair: boolean;
}

export class GuestProfileService {
  /**
   * Resolves guest operating system capabilities and distribution details from the OS template filename.
   */
  public static resolveProfile(osTemplate: string): GuestProfile {
    const templateLower = (osTemplate || '').toLowerCase();

    if (templateLower.includes('win') || templateLower.includes('windows')) {
      return {
        guestType: 'Windows',
        distribution: 'Windows',
        supportsCloudInit: false,
        supportsGuestAgent: true,
        supportsSnapshots: true,
        supportsPasswordReset: false,
        supportsSerialRepair: false
      };
    }

    if (templateLower.includes('bsd') || templateLower.includes('freebsd') || templateLower.includes('pfsense')) {
      return {
        guestType: 'BSD',
        distribution: 'FreeBSD',
        supportsCloudInit: false,
        supportsGuestAgent: false,
        supportsSnapshots: true,
        supportsPasswordReset: false,
        supportsSerialRepair: false
      };
    }

    // Default to Linux guest profile resolver
    let dist = 'Unknown';
    if (templateLower.includes('ubuntu')) dist = 'Ubuntu';
    else if (templateLower.includes('debian')) dist = 'Debian';
    else if (templateLower.includes('centos')) dist = 'CentOS';
    else if (templateLower.includes('rocky')) dist = 'Rocky';
    else if (templateLower.includes('alma')) dist = 'Alma';
    else if (templateLower.includes('arch')) dist = 'Arch';
    else if (templateLower.includes('alpine')) dist = 'Alpine';

    return {
      guestType: 'Linux',
      distribution: dist,
      // Alpine template doesn't typically boot standard cloud-init unless explicitly configured
      supportsCloudInit: !templateLower.includes('alpine'),
      supportsGuestAgent: true,
      supportsSnapshots: true,
      supportsPasswordReset: true,
      supportsSerialRepair: dist !== 'Unknown'
    };
  }
}
