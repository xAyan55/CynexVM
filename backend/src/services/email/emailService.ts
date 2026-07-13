import dns from 'dns';
import nodemailer from 'nodemailer';
import { db } from '../../db';
import { CryptoService } from '../cryptoService';
import { EmailBrandingService } from './emailBrandingService';

// Prefer IPv4 when SMTP hostname resolves to both A and AAAA records
try { dns.setDefaultResultOrder('ipv4first'); } catch {} 

export interface SmtpConfigData {
  id: string;
  host: string;
  port: number;
  username: string;
  encryptedPassword: string;
  encryption: string;
  senderName: string;
  senderEmail: string;
  replyTo?: string | null;
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

export class EmailService {
  private static transporterCache = new Map<string, nodemailer.Transporter>();

  public static async getDefaultSmtpConfig(): Promise<SmtpConfigData | null> {
    const config = await db.smtpConfig.findFirst({ where: { isDefault: true } });
    return config;
  }

  public static async getSmtpConfig(id: string): Promise<SmtpConfigData | null> {
    const config = await db.smtpConfig.findUnique({ where: { id } });
    return config;
  }

  public static decryptPassword(config: SmtpConfigData): string {
    try {
      return CryptoService.decrypt(config.encryptedPassword);
    } catch {
      return '';
    }
  }

  public static createTransporter(config: SmtpConfigData): nodemailer.Transporter {
    const cacheKey = config.id;
    const cached = this.transporterCache.get(cacheKey);
    if (cached) return cached;

    const pass = this.decryptPassword(config);
    const secure = config.encryption === 'tls';
    const requireTls = config.encryption === 'starttls' || config.encryption === 'tls';

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure,
      requireTls,
      auth: {
        user: config.username,
        pass
      },
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    } as any);

    this.transporterCache.set(cacheKey, transporter);
    return transporter;
  }

  public static clearCache(configId?: string) {
    if (configId) {
      this.transporterCache.delete(configId);
    } else {
      this.transporterCache.clear();
    }
  }

  public static async testConnection(config: SmtpConfigData): Promise<{ success: boolean; message: string }> {
    try {
      const transporter = this.createTransporter(config);
      const result = await transporter.verify();
      return { success: true, message: 'SMTP connection verified successfully' };
    } catch (err: any) {
      return { success: false, message: err.message || 'SMTP connection failed' };
    }
  }

  private static validateEmailOptions(options: SendEmailOptions): string | null {
    const recipient = options.to;
    if (!recipient) return 'Recipient email address is missing';
    if (!options.subject) return `Email to ${recipient} missing subject`;
    if (!options.html && !options.plainText) return `Email to ${recipient} missing HTML and plain text content`;
    return null;
  }

  public static async sendEmail(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const validationError = this.validateEmailOptions(options);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const config = options.smtpConfig || await this.getDefaultSmtpConfig();
    if (!config) {
      return { success: false, error: 'No SMTP configuration found' };
    }

    try {
      const transporter = this.createTransporter(config);
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

      const mailOptions: nodemailer.SendMailOptions = {
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
          'X-Mailer': panelName + '-Email'
        }
      };

      const info = await transporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to send email', messageId: undefined };
    }
  }

  public static async sendTemplateEmail(
    to: string,
    templateName: string,
    variables: Record<string, any> = {},
    options?: { cc?: string; bcc?: string; smtpConfigId?: string; userId?: string }
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { EmailTemplateService } = require('./emailTemplateService');
    const template = await EmailTemplateService.getTemplate(templateName);
    if (!template) {
      return { success: false, error: `Email template '${templateName}' not found` };
    }

    const rendered = await EmailTemplateService.render(template, variables);
    const config = options?.smtpConfigId
      ? await this.getSmtpConfig(options.smtpConfigId)
      : await this.getDefaultSmtpConfig();

    const result = await this.sendEmail({
      to,
      cc: options?.cc,
      bcc: options?.bcc,
      subject: rendered.subject,
      html: rendered.html,
      plainText: rendered.plainText,
      smtpConfig: config || undefined
    });

    return result;
  }

  public static async encryptPassword(plainPassword: string): Promise<string> {
    return CryptoService.encrypt(plainPassword);
  }

  public static async sendRaw(options: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    html: string;
    plainText?: string;
    smtpConfigId?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
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
