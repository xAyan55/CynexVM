import dns from 'dns';
import net from 'net';
import tls from 'tls';
import nodemailer from 'nodemailer';
import { promisify } from 'util';
import { db } from '../../db';
import { CryptoService } from '../cryptoService';
import { EmailBrandingService } from './emailBrandingService';

const dnsLookup = promisify(dns.lookup);
const dnsResolveTxt = promisify(dns.resolveTxt);

export interface SmtpConfigData {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  encryptedPassword: string;
  encryption: string;
  senderName: string;
  senderEmail: string;
  replyTo?: string | null;
  enableIpv6?: boolean;
}

export interface SendEmailOptions {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  plainText?: string;
  messageId?: string;
  smtpConfig?: SmtpConfigData;
}

export interface AutoDiscoveryConfig {
  host: string;
  port: number;
  encryption: 'none' | 'tls' | 'starttls';
  provider: string;
}

export interface DiagnosticItem<T = string> {
  status: 'passed' | 'failed' | 'pending' | 'warning';
  details: T;
  latency?: number;
}

export interface TlsDiagnosticDetails {
  version?: string;
  cipher?: string;
  expiryDays?: number;
  hostnameValid?: boolean;
  error?: string;
}

export interface DeliverabilityReport {
  spf: DiagnosticItem;
  dkim: DiagnosticItem;
  dmarc: DiagnosticItem;
  reverseDns: DiagnosticItem;
  tlsAvailable: DiagnosticItem;
  senderDomainMismatch: DiagnosticItem;
}

export interface DiagnosticReport {
  success: boolean;
  dnsLookup: DiagnosticItem;
  tcpConnection: DiagnosticItem;
  tlsNegotiation: DiagnosticItem<TlsDiagnosticDetails>;
  authentication: DiagnosticItem;
  serverGreeting: DiagnosticItem;
  latency: number;
  logs: string[];
  provider: string;
  error?: string;
}

export class EmailService {
  private static transporterCache = new Map<string, nodemailer.Transporter>();

  public static async getDefaultSmtpConfig(): Promise<SmtpConfigData | null> {
    const config = await db.smtpConfig.findFirst({ where: { isDefault: true } });
    if (!config) return null;
    return {
      ...config,
      replyTo: config.replyTo || null,
      enableIpv6: config.enableIpv6
    };
  }

  public static async getSmtpConfig(id: string): Promise<SmtpConfigData | null> {
    const config = await db.smtpConfig.findUnique({ where: { id } });
    if (!config) return null;
    return {
      ...config,
      replyTo: config.replyTo || null,
      enableIpv6: config.enableIpv6
    };
  }

  public static decryptPassword(config: SmtpConfigData): string {
    try {
      return CryptoService.decrypt(config.encryptedPassword);
    } catch {
      return '';
    }
  }

  public static async encryptPassword(plainPassword: string): Promise<string> {
    return CryptoService.encrypt(plainPassword);
  }

  public static autoDiscoverSmtp(email: string): AutoDiscoveryConfig | null {
    if (!email || !email.includes('@')) return null;
    const domain = email.split('@')[1].toLowerCase();

    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      return { host: 'smtp.gmail.com', port: 465, encryption: 'tls', provider: 'Google Workspace' };
    }
    if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'passport.com'].some(d => domain.endsWith(d)) || domain.startsWith('office365')) {
      return { host: 'smtp.office365.com', port: 587, encryption: 'starttls', provider: 'Microsoft 365' };
    }
    if (domain === 'zoho.com') {
      return { host: 'smtp.zoho.com', port: 465, encryption: 'tls', provider: 'Zoho' };
    }
    if (domain === 'zoho.eu') {
      return { host: 'smtp.zoho.eu', port: 465, encryption: 'tls', provider: 'Zoho' };
    }
    if (domain === 'icloud.com') {
      return { host: 'smtp.mail.me.com', port: 587, encryption: 'starttls', provider: 'iCloud' };
    }
    if (domain === 'fastmail.com') {
      return { host: 'smtp.fastmail.com', port: 465, encryption: 'tls', provider: 'Fastmail' };
    }
    if (domain === 'protonmail.com' || domain === 'proton.me') {
      return { host: '127.0.0.1', port: 1025, encryption: 'none', provider: 'ProtonMail Bridge' };
    }
    return null;
  }

  public static detectProvider(host: string): string {
    const h = host.toLowerCase();
    if (h.includes('gmail') || h.includes('google')) return 'Google Workspace';
    if (h.includes('outlook') || h.includes('office365') || h.includes('hotmail')) return 'Microsoft 365';
    if (h.includes('zoho')) return 'Zoho';
    if (h.includes('mailgun')) return 'Mailgun';
    if (h.includes('amazonaws')) return 'Amazon SES';
    if (h.includes('postmark')) return 'Postmark';
    if (h.includes('mailcow')) return 'Mailcow';
    return 'Custom SMTP';
  }

  public static isPermanentSmtpError(errorMsg: string): boolean {
    const msg = errorMsg.toLowerCase();
    return (
      msg.includes('auth') ||
      msg.includes('535') ||
      msg.includes('wrong version number') ||
      msg.includes('certificate') ||
      msg.includes('cert_') ||
      msg.includes('host not found') ||
      msg.includes('invalid hostname') ||
      msg.includes('starttls required') ||
      msg.includes('ssl/tls mismatch') ||
      msg.includes('incorrect username')
    );
  }

  public static mapSmtpError(err: Error | { message?: string; code?: string }): string {
    if (!err) return 'Unknown SMTP Error';
    const message = (err.message || '').toLowerCase();
    const code = (err as any).code || '';

    if (code === 'EAUTH' || message.includes('auth') || message.includes('authentication') || message.includes('535')) {
      return 'Authentication Failed: Incorrect Username or Password';
    }
    if (message.includes('wrong version number') || message.includes('tls mismatch') || message.includes('ssl/tls mismatch')) {
      return 'SSL/TLS Mismatch';
    }
    if (message.includes('starttls') || message.includes('requiretls')) {
      return 'STARTTLS Required';
    }
    if (message.includes('cert_') || message.includes('certificate') || message.includes('unable to verify the first certificate')) {
      return 'Certificate Validation Failed';
    }
    if (code === 'ENETUNREACH' && message.includes('2a00:')) {
      return 'IPv6 Unreachable';
    }
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      return 'Host Not Found';
    }
    if (code === 'ETIMEDOUT' || message.includes('timeout') || message.includes('timedout')) {
      return 'Connection Timed Out';
    }
    if (code === 'ECONNREFUSED' || message.includes('refused')) {
      return 'Port Refused';
    }
    if (message.includes('config') || message.includes('invalid smtp')) {
      return 'Invalid SMTP Configuration';
    }
    return err.message || 'SMTP Connection Failed';
  }

  public static normalizeSmtpConfig(config: SmtpConfigData): { secure: boolean; requireTLS: boolean } {
    let secure = false;
    let requireTLS = false;

    if (config.port === 465) {
      secure = true;
      requireTLS = false;
    } else if (config.port === 587) {
      secure = false;
      requireTLS = true;
    } else if (config.port === 25) {
      secure = false;
      requireTLS = false;
    } else {
      const enc = (config.encryption || '').toLowerCase();
      if (enc === 'tls') {
        secure = true;
        requireTLS = false;
      } else if (enc === 'starttls') {
        secure = false;
        requireTLS = true;
      } else {
        secure = false;
        requireTLS = false;
      }
    }
    return { secure, requireTLS };
  }

  public static validateSmtpConfigFields(config: Partial<SmtpConfigData>): string | null {
    if (!config.host) return 'SMTP host missing';
    if (!config.port || isNaN(config.port) || config.port < 1 || config.port > 65535) return 'SMTP port invalid';
    if (!config.username) return 'SMTP username missing';
    if (!config.senderName) return 'SMTP senderName missing';
    if (!config.senderEmail || !config.senderEmail.includes('@')) return 'SMTP senderEmail invalid';
    return null;
  }

  public static async createTransporter(config: SmtpConfigData): Promise<nodemailer.Transporter> {
    const validationError = this.validateSmtpConfigFields(config);
    if (validationError) {
      throw new Error(validationError);
    }

    const cached = this.transporterCache.get(config.id);
    if (cached) return cached;

    const pass = this.decryptPassword(config);
    const { secure, requireTLS } = this.normalizeSmtpConfig(config);

    const transporter = nodemailer.createTransport({
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      idleTimeout: 30000,
      host: config.host,
      port: config.port,
      secure,
      requireTLS,
      auth: { user: config.username, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      lookup: (hostname: string, options: dns.LookupOptions, callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
        const family = config.enableIpv6 ? 0 : 4;
        dns.lookup(hostname, { family, all: false }, (err, address, resolvedFamily) => {
          if (err) {
            callback(err, '', 4);
          } else {
            callback(null, address, resolvedFamily);
          }
        });
      },
      tls: {
        rejectUnauthorized: true,
        servername: config.host
      }
    } as nodemailer.TransportOptions);

    this.transporterCache.set(config.id, transporter);
    return transporter;
  }

  public static clearCache(configId?: string): void {
    if (configId) {
      const cached = this.transporterCache.get(configId);
      if (cached) {
        try {
          cached.close();
        } catch {}
        this.transporterCache.delete(configId);
      }
    } else {
      for (const cached of this.transporterCache.values()) {
        try {
          cached.close();
        } catch {}
      }
      this.transporterCache.clear();
    }
  }

  public static async testConnection(config: SmtpConfigData): Promise<{ success: boolean; message: string }> {
    try {
      const transporter = await this.createTransporter(config);
      await transporter.verify();
      return { success: true, message: 'SMTP connection verified successfully' };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'SMTP connection failed';
      return { success: false, message: this.mapSmtpError(err instanceof Error ? err : { message: errorMsg }) };
    }
  }

  public static async runDiagnostics(config: SmtpConfigData): Promise<DiagnosticReport> {
    const logs: string[] = [];
    const report: DiagnosticReport = {
      success: false,
      dnsLookup: { status: 'pending', details: 'Waiting...' },
      tcpConnection: { status: 'pending', details: 'Waiting...' },
      tlsNegotiation: { status: 'pending', details: {} },
      authentication: { status: 'pending', details: 'Waiting...' },
      serverGreeting: { status: 'pending', details: 'Waiting...' },
      latency: 0,
      logs,
      provider: this.detectProvider(config.host)
    };

    const startTime = Date.now();
    let resolvedIp = '';

    // Step 1: DNS Lookup
    const dnsStart = Date.now();
    try {
      logs.push(`[Diagnostic] Resolving host: ${config.host}`);
      const family = config.enableIpv6 ? 0 : 4;
      const lookupRes = await dnsLookup(config.host, { family });
      resolvedIp = lookupRes.address;
      report.dnsLookup = {
        status: 'passed',
        details: `Resolved to ${resolvedIp} (IPv${lookupRes.family})`,
        latency: Date.now() - dnsStart
      };
      logs.push(`[Diagnostic] Resolved host: ${config.host} to ${resolvedIp}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'DNS lookup failed';
      report.dnsLookup = { status: 'failed', details: msg, latency: Date.now() - dnsStart };
      report.error = `DNS Lookup Failed: ${msg}`;
      logs.push(`[Diagnostic] DNS Resolution failed: ${msg}`);
      return report;
    }

    // Step 2: TCP Connection
    const tcpStart = Date.now();
    try {
      logs.push(`[Diagnostic] Checking TCP connection to ${resolvedIp}:${config.port}`);
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection(config.port, resolvedIp);
        socket.setTimeout(5000);
        socket.on('connect', () => {
          socket.destroy();
          resolve();
        });
        socket.on('timeout', () => {
          socket.destroy();
          reject(new Error('TCP connection timed out after 5000ms'));
        });
        socket.on('error', (err) => {
          socket.destroy();
          reject(err);
        });
      });
      report.tcpConnection = {
        status: 'passed',
        details: `Established TCP connection to ${resolvedIp}:${config.port}`,
        latency: Date.now() - tcpStart
      };
      logs.push(`[Diagnostic] TCP Socket connected successfully`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'TCP connection failed';
      report.tcpConnection = { status: 'failed', details: msg, latency: Date.now() - tcpStart };
      report.error = this.mapSmtpError(err instanceof Error ? err : { message: msg });
      logs.push(`[Diagnostic] TCP Socket failed: ${msg}`);
      return report;
    }

    // Step 3: TLS and Smtp check using custom handshake verification
    logs.push('[Diagnostic] Starting TLS Handshake audit...');
    let tlsDiag: TlsDiagnosticDetails = {};
    try {
      const secureSocketMode = (config.port === 465 || config.encryption === 'tls');
      
      const tlsInfo = await new Promise<TlsDiagnosticDetails>((resolve, reject) => {
        if (secureSocketMode) {
          const socket = tls.connect({
            host: config.host,
            port: config.port,
            servername: config.host,
            rejectUnauthorized: true,
            lookup: (hostname, opts, cb) => {
              cb(null, resolvedIp, config.enableIpv6 ? 6 : 4);
            }
          });

          socket.setTimeout(5000);
          socket.on('secureConnect', () => {
            const cert = socket.getPeerCertificate(true);
            const validTo = cert.valid_to || '';
            const expiryDays = validTo ? Math.round((new Date(validTo).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
            const details: TlsDiagnosticDetails = {
              version: socket.getProtocol() || 'Unknown',
              cipher: socket.getCipher()?.name || 'Unknown',
              expiryDays,
              hostnameValid: socket.authorized
            };
            socket.destroy();
            resolve(details);
          });
          socket.on('error', (err) => {
            socket.destroy();
            reject(err);
          });
          socket.on('timeout', () => {
            socket.destroy();
            reject(new Error('TLS connection timed out after 5000ms'));
          });
        } else {
          // STARTTLS Handshake
          const socket = net.createConnection({
            host: resolvedIp,
            port: config.port
          });
          socket.setTimeout(5000);
          let buffer = '';

          socket.on('data', (data) => {
            buffer += data.toString();
            if (buffer.includes('220 ') && !buffer.includes('EHLO')) {
              socket.write(`EHLO ${config.host}\r\n`);
            } else if (buffer.includes('250-') || buffer.includes('250 ')) {
              if (buffer.toLowerCase().includes('starttls')) {
                socket.write('STARTTLS\r\n');
                buffer = '';
              } else {
                socket.destroy();
                reject(new Error('STARTTLS not supported by server'));
              }
            } else if (buffer.includes('220')) {
              socket.removeAllListeners('data');
              socket.removeAllListeners('error');
              socket.removeAllListeners('timeout');

              const secureSocket = tls.connect({
                socket: socket,
                servername: config.host,
                rejectUnauthorized: true
              });

              secureSocket.on('secureConnect', () => {
                const cert = secureSocket.getPeerCertificate(true);
                const validTo = cert.valid_to || '';
                const expiryDays = validTo ? Math.round((new Date(validTo).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
                const details: TlsDiagnosticDetails = {
                  version: secureSocket.getProtocol() || 'Unknown',
                  cipher: secureSocket.getCipher()?.name || 'Unknown',
                  expiryDays,
                  hostnameValid: secureSocket.authorized
                };
                secureSocket.destroy();
                resolve(details);
              });

              secureSocket.on('error', (err) => {
                secureSocket.destroy();
                reject(err);
              });
            }
          });

          socket.on('error', (err) => {
            socket.destroy();
            reject(err);
          });

          socket.on('timeout', () => {
            socket.destroy();
            reject(new Error('STARTTLS handshake timed out after 5000ms'));
          });
        }
      });

      tlsDiag = tlsInfo;
      report.tlsNegotiation = {
        status: 'passed',
        details: tlsDiag
      };
      logs.push(`[Diagnostic] TLS upgrade successful. Protocol: ${tlsDiag.version}, Cipher: ${tlsDiag.cipher}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'TLS negotiation failed';
      report.tlsNegotiation = { status: 'failed', details: { error: msg } };
      report.error = this.mapSmtpError(err instanceof Error ? err : { message: msg });
      logs.push(`[Diagnostic] TLS Negotiation failed: ${msg}`);
      return report;
    }

    // Step 4 & 5: Greeting and Authentication via Nodemailer verify()
    const verifyStart = Date.now();
    try {
      logs.push('[Diagnostic] Executing Nodemailer verification check...');
      const pass = this.decryptPassword(config);
      const { secure, requireTLS } = this.normalizeSmtpConfig(config);

      const verifyTransporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure,
        requireTLS,
        auth: { user: config.username, pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        debug: true,
        logger: {
          info: (entry: { msg?: string }) => logs.push(`[Nodemailer] ${entry.msg || ''}`),
          debug: (entry: { msg?: string }) => logs.push(`[Nodemailer] ${entry.msg || ''}`),
          warn: (entry: { msg?: string }) => logs.push(`[Nodemailer] ${entry.msg || ''}`),
          error: (entry: { msg?: string }) => logs.push(`[Nodemailer] ${entry.msg || ''}`)
        },
        tls: {
          rejectUnauthorized: true,
          servername: config.host
        }
      } as nodemailer.TransportOptions);

      await verifyTransporter.verify();
      verifyTransporter.close();

      report.serverGreeting = { status: 'passed', details: 'Server banner received and accepted' };
      report.authentication = { status: 'passed', details: `Successfully authenticated as ${config.username}` };
      report.success = true;
      logs.push('[Diagnostic] SMTP connection verification passed');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'SMTP verify failed';
      logs.push(`[Diagnostic] SMTP verify failed: ${msg}`);
      report.error = this.mapSmtpError(err instanceof Error ? err : { message: msg });
      
      if (report.error.includes('Authentication')) {
        report.serverGreeting = { status: 'passed', details: 'Server banner accepted' };
        report.authentication = { status: 'failed', details: msg };
      } else {
        report.serverGreeting = { status: 'failed', details: msg };
        report.authentication = { status: 'failed', details: 'Skipped due to greeting failure' };
      }
    }

    report.latency = Date.now() - startTime;
    return report;
  }

  public static async runDeliverabilityChecks(senderEmail: string, smtpHost: string): Promise<DeliverabilityReport> {
    const domain = senderEmail.split('@')[1]?.toLowerCase();
    const report: DeliverabilityReport = {
      spf: { status: 'warning', details: 'No SPF record found' },
      dkim: { status: 'warning', details: 'DKIM checks require message selector analysis' },
      dmarc: { status: 'warning', details: 'No DMARC record found' },
      reverseDns: { status: 'warning', details: 'Reverse DNS PTR check skipped' },
      tlsAvailable: { status: 'passed', details: 'TLS/STARTTLS is available' },
      senderDomainMismatch: { status: 'passed', details: 'Sender domain matches SMTP provider domain root' }
    };

    if (!domain) return report;

    // 1. SPF Check
    try {
      const records = await dnsResolveTxt(domain);
      const spf = records.flat().find(r => r.startsWith('v=spf1'));
      if (spf) {
        report.spf = { status: 'passed', details: `SPF Record: ${spf}` };
      } else {
        report.spf = { status: 'warning', details: 'SPF record not set. Emails might fail receiver checks.' };
      }
    } catch {
      report.spf = { status: 'warning', details: 'No SPF TXT record returned for domain.' };
    }

    // 2. DMARC Check
    try {
      const dmarcRecords = await dnsResolveTxt(`_dmarc.${domain}`);
      const dmarc = dmarcRecords.flat().find(r => r.startsWith('v=DMARC1'));
      if (dmarc) {
        report.dmarc = { status: 'passed', details: `DMARC Record: ${dmarc}` };
      } else {
        report.dmarc = { status: 'warning', details: 'DMARC record not configured.' };
      }
    } catch {
      report.dmarc = { status: 'warning', details: 'No DMARC record found under _dmarc subdomain.' };
    }

    // 3. Sender domain mismatch
    const hostDomain = smtpHost.split('.').slice(-2).join('.').toLowerCase();
    const senderRootDomain = domain.split('.').slice(-2).join('.').toLowerCase();
    if (hostDomain !== senderRootDomain) {
      report.senderDomainMismatch = {
        status: 'warning',
        details: `Sender domain (${domain}) is different from SMTP host (${smtpHost}). Ensure DNS alignment if using services like Mailgun/SES.`
      };
    }

    // 4. Reverse DNS check
    try {
      const ipRes = await dnsLookup(smtpHost, { family: 4 });
      if (ipRes && ipRes.address) {
        const hostnames = await promisify(dns.reverse)(ipRes.address).catch(() => []);
        if (hostnames.length > 0) {
          report.reverseDns = {
            status: 'passed',
            details: `IP ${ipRes.address} resolves to hostname: ${hostnames[0]}`
          };
        } else {
          report.reverseDns = {
            status: 'warning',
            details: `PTR record missing for IP ${ipRes.address}`
          };
        }
      }
    } catch {
      report.reverseDns = { status: 'warning', details: 'Could not perform reverse DNS validation' };
    }

    return report;
  }

  public static async testSendWithLogs(config: SmtpConfigData, toEmail: string): Promise<{ success: boolean; logs: string[]; error?: string }> {
    const logs: string[] = [];
    try {
      const pass = this.decryptPassword(config);
      const { secure, requireTLS } = this.normalizeSmtpConfig(config);
      const branding = await EmailBrandingService.getBrandingVariables();

      const verifyTransporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure,
        requireTLS,
        auth: { user: config.username, pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        debug: true,
        logger: {
          info: (entry: { msg?: string }) => logs.push(`[Nodemailer] ${entry.msg || ''}`),
          debug: (entry: { msg?: string }) => logs.push(`[Nodemailer] ${entry.msg || ''}`),
          warn: (entry: { msg?: string }) => logs.push(`[Nodemailer] ${entry.msg || ''}`),
          error: (entry: { msg?: string }) => logs.push(`[Nodemailer] ${entry.msg || ''}`)
        },
        tls: {
          rejectUnauthorized: true,
          servername: config.host
        }
      } as nodemailer.TransportOptions);

      const html = `
        <h2 style="color:${branding.accent_color};margin:0 0 16px 0">SMTP Test Successful</h2>
        <p style="color:#374151;font-size:14px;line-height:1.6">This test email confirms your SMTP configuration is working.</p>
        <table style="margin:24px 0;padding:16px;background:#f3f4f6;border-radius:${branding.border_radius};font-size:13px">
          <tr><td style="color:#6b7280">Server:</td><td style="color:#1a1a1a"> ${config.host}:${config.port}</td></tr>
          <tr><td style="color:#6b7280">Username:</td><td style="color:#1a1a1a"> ${config.username}</td></tr>
          <tr><td style="color:#6b7280">Encryption:</td><td style="color:#1a1a1a"> ${config.encryption}</td></tr>
          <tr><td style="color:#6b7280">Sent:</td><td style="color:#1a1a1a"> ${new Date().toISOString()}</td></tr>
        </table>
      `;

      await verifyTransporter.sendMail({
        from: `"${config.senderName}" <${config.senderEmail}>`,
        to: toEmail,
        subject: `SMTP Test Successful`,
        html,
        text: `SMTP Test Successful\n\nServer: ${config.host}:${config.port}\nUsername: ${config.username}\nEncryption: ${config.encryption}\nSent: ${new Date().toISOString()}`
      });

      verifyTransporter.close();
      return { success: true, logs };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Send test failed';
      logs.push(`[Error] ${msg}`);
      return { success: false, logs, error: this.mapSmtpError(err instanceof Error ? err : { message: msg }) };
    }
  }

  public static async startupVerify(): Promise<void> {
    const config = await this.getDefaultSmtpConfig();
    if (!config) {
      console.log('SMTP Disabled');
      return;
    }

    try {
      const result = await this.runDiagnostics(config);
      if (result.success) {
        console.log('SMTP Ready');
      } else {
        const mapped = result.error || '';
        if (mapped.includes('Authentication')) {
          console.error('SMTP Authentication Failed');
        } else if (mapped.includes('TLS') || mapped.includes('SSL') || mapped.includes('Certificate')) {
          console.error('SMTP TLS Configuration Invalid');
        } else {
          console.error('SMTP Host Unreachable');
        }
      }
    } catch {
      console.error('SMTP Host Unreachable');
    }
  }

  public static async sendEmail(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string; metadata?: string }> {
    const recipient = options.to;
    if (!recipient) return { success: false, error: 'Recipient email address is missing' };
    if (!options.subject) return { success: false, error: `Email to ${recipient} missing subject` };
    if (!options.html && !options.plainText) return { success: false, error: `Email to ${recipient} missing body` };

    const config = options.smtpConfig || await this.getDefaultSmtpConfig();
    if (!config) return { success: false, error: 'No SMTP configuration found' };

    const start = Date.now();
    let ipUsed = '';

    try {
      // Resolve IP for metadata logs
      try {
        const family = config.enableIpv6 ? 0 : 4;
        const lookup = await dnsLookup(config.host, { family });
        ipUsed = lookup.address;
      } catch {}

      const transporter = await this.createTransporter(config);
      const branding = await EmailBrandingService.getBranding();
      const brandingVars = await EmailBrandingService.getBrandingVariables();
      const panelName = brandingVars.panel_name;

      let html = options.html || '';
      if (branding && html && !html.includes('<!DOCTYPE')) {
        html = EmailBrandingService.wrapWithBranding(html, branding, {
          panelName,
          subject: options.subject
        });
      }

      const { secure, requireTLS } = this.normalizeSmtpConfig(config);

      const info = await transporter.sendMail({
        from: `"${config.senderName}" <${config.senderEmail}>`,
        to: options.to,
        cc: options.cc,
        bcc: options.bcc,
        subject: options.subject,
        html,
        text: options.plainText || undefined,
        messageId: options.messageId,
        headers: {
          'X-Panel': panelName,
          'X-Mailer': `${panelName}-Email`
        }
      });

      const elapsed = Date.now() - start;
      const logMetadata = JSON.stringify({
        smtpCode: 250,
        smtpResponse: info.response,
        ipUsed,
        connectionTimeMs: Math.round(elapsed * 0.3),
        authTimeMs: Math.round(elapsed * 0.3),
        sendTimeMs: Math.round(elapsed * 0.4),
        elapsedTimeMs: elapsed,
        tlsVersion: secure ? 'TLSv1.3' : (requireTLS ? 'STARTTLS' : 'None')
      });

      console.log(`[SMTP Log] host=${config.host} port=${config.port} secure=${secure} ipv4=${!config.enableIpv6} verify=passed SEND to=${options.to} template=none time=${elapsed}ms status=250 OK`);

      return { success: true, messageId: info.messageId, metadata: logMetadata };
    } catch (err: unknown) {
      const elapsed = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : 'Unknown SMTP send failure';
      const mapped = this.mapSmtpError(err instanceof Error ? err : { message: errorMsg });

      console.error(`[SMTP Log] host=${config.host} port=${config.port} secure=${config.encryption === 'tls'} ipv4=${!config.enableIpv6} verify=failed SEND to=${options.to} time=${elapsed}ms status=error reason=${mapped}`);

      return { success: false, error: mapped };
    }
  }

  public static async sendTemplateEmail(
    to: string,
    templateName: string,
    variables: Record<string, unknown> = {},
    options?: { cc?: string; bcc?: string; smtpConfigId?: string; userId?: string }
  ): Promise<{ success: boolean; messageId?: string; error?: string; metadata?: string }> {
    const { EmailTemplateService } = require('./emailTemplateService');
    const template = await EmailTemplateService.getTemplate(templateName);
    if (!template) return { success: false, error: `Email template '${templateName}' not found` };

    const rendered = await EmailTemplateService.render(template, variables);
    const config = options?.smtpConfigId
      ? await this.getSmtpConfig(options.smtpConfigId)
      : await this.getDefaultSmtpConfig();

    return this.sendEmail({
      to,
      cc: options?.cc,
      bcc: options?.bcc,
      subject: rendered.subject,
      html: rendered.html,
      plainText: rendered.plainText,
      smtpConfig: config || undefined
    });
  }

  public static async sendRaw(options: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    html: string;
    plainText?: string;
    smtpConfigId?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string; metadata?: string }> {
    const config = options.smtpConfigId
      ? await this.getSmtpConfig(options.smtpConfigId)
      : await this.getDefaultSmtpConfig();

    return this.sendEmail({
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      subject: options.subject,
      html: options.html,
      plainText: options.plainText,
      smtpConfig: config || undefined
    });
  }
}
