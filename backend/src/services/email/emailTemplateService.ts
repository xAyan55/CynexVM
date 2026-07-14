import { db } from '../../db';
import { builtinTemplates } from './emailBuiltinTemplates';
import { EmailBrandingService } from './emailBrandingService';

export interface TemplateData {
  id: string;
  name: string;
  description?: string | null;
  subject: string;
  htmlBody: string;
  plainText?: string | null;
  category: string;
  isBuiltin: boolean;
  isActive: boolean;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  plainText: string;
}

function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((curr: unknown, key: string) => {
    if (curr === null || curr === undefined) return undefined;
    if (typeof curr === 'object' && key in (curr as Record<string, unknown>)) {
      return (curr as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export class EmailTemplateService {
  private static templateCache = new Map<string, TemplateData>();
  private static invalidTemplates = new Set<string>();

  public static isTemplateInvalid(name: string): boolean {
    return this.invalidTemplates.has(name);
  }

  public static async preloadTemplates(): Promise<void> {
    this.templateCache.clear();
    const templates = await db.emailTemplate.findMany();
    for (const tpl of templates) {
      this.templateCache.set(tpl.name, tpl);
    }
    console.log(`[Email Cache] Preloaded ${this.templateCache.size} templates into memory.`);
  }

  public static getDummyVariables(): Record<string, any> {
    return {
      username: 'dummy_user',
      email: 'dummy@example.com',
      date: new Date().toISOString(),
      verification_url: 'http://localhost/verify',
      expiry_hours: '24',
      code: '123456',
      expiry_minutes: '15',
      reset_url: 'http://localhost/reset',
      time: new Date().toISOString(),
      ip: '127.0.0.1',
      user_agent: 'Mozilla/5.0',
      old_email: 'old@example.com',
      new_email: 'new@example.com',
      attempts: '3',
      lockout_minutes: '30',
      location: 'New York, US',
      key_name: 'test-api-key',
      instance_name: 'test-instance',
      os: 'Ubuntu 22.04',
      cpu: '2',
      ram: '2048',
      storage: '20',
      ip_address: '192.168.1.100',
      node: 'Node-1',
      instance_id: 'inst-123',
      reason: 'Policy violation',
      resource: 'CPU',
      usage_percent: '92',
      usage: '1.84',
      limit: '2.0',
      size: '1024 MB',
      backup_type: 'Full',
      error: 'Connection timeout',
      duration: '45s',
      node_name: 'hypervisor-01',
      last_seen: new Date().toISOString(),
      container_count: '15',
      start_time: new Date().toISOString(),
      end_time: new Date().toISOString(),
      details: 'Database migration maintenance',
      invoice_number: 'INV-001',
      amount: '15.00',
      currency: 'USD',
      due_date: new Date().toISOString(),
      status: 'Unpaid',
      invoice_id: 'inv-123',
      payment_method: 'Credit Card',
      ticket_number: 'TCK-999',
      ticket_subject: 'Unable to connect to console',
      priority: 'High',
      author: 'Support Staff',
      preview: 'Hello, how can we help?',
      ticket_id: 'tkt-123',
      smtp_host: 'smtp.example.com',
      smtp_port: '587',
      smtp_user: 'smtp_user',
      encryption: 'STARTTLS',
      title: 'Notification Title',
      message: 'This is a test notification message.',
      action_url: 'http://localhost/action',
      category: 'system',
      color: '#e11d48',
      announcement_title: 'Global Maintenance Announcement',
      announcement_message: 'We will be conducting updates tonight.',
      announcement_footer: 'Thank you for your cooperation.',
      task_name: 'Clean Logs',
      period_start: new Date().toISOString(),
      period_end: new Date().toISOString(),
      login_count: '12',
      failed_login_count: '1',
      password_changes: '0',
      api_keys_created: '2',
      api_keys_revoked: '1',
      active_sessions: '5'
    };
  }

  public static async verifyBuiltinTemplates(): Promise<void> {
    const dummyVars = this.getDummyVariables();
    for (const tpl of builtinTemplates) {
      try {
        const dbTpl = await this.getTemplate(tpl.name);
        const templateToVerify = dbTpl || {
          name: tpl.name,
          subject: tpl.subject,
          htmlBody: tpl.htmlBody,
          plainText: tpl.plainText || null,
          category: tpl.category || 'system',
          isBuiltin: true,
          isActive: true
        };

        const rendered = await this.render(templateToVerify as any, dummyVars);
        if (!rendered.subject || rendered.subject.trim().length === 0) {
          throw new Error('Rendered subject is empty');
        }
        if (!rendered.html || rendered.html.trim().length === 0) {
          throw new Error('Rendered HTML body is empty');
        }
      } catch (err: any) {
        console.error(`❌ Template Validation Failed\nTemplate: ${tpl.name}\nReason: ${err.message}\n`);
        this.invalidTemplates.add(tpl.name);
      }
    }
  }

  public static async ensureBuiltinTemplates(): Promise<void> {
    for (const tpl of builtinTemplates) {
      const existing = await db.emailTemplate.findUnique({ where: { name: tpl.name } });
      if (!existing) {
        await db.emailTemplate.create({
          data: {
            name: tpl.name,
            description: tpl.description,
            subject: tpl.subject,
            htmlBody: tpl.htmlBody,
            plainText: tpl.plainText || null,
            category: tpl.category || 'system',
            isBuiltin: true,
            isActive: true
          }
        });
      }
    }
  }

  public static async getTemplate(name: string): Promise<TemplateData | null> {
    const cached = this.templateCache.get(name);
    if (cached) return cached;

    const dbTpl = await db.emailTemplate.findUnique({ where: { name } });
    if (dbTpl) {
      this.templateCache.set(name, dbTpl);
    }
    return dbTpl;
  }

  public static async getTemplateById(id: string): Promise<TemplateData | null> {
    for (const tpl of this.templateCache.values()) {
      if (tpl.id === id) return tpl;
    }
    const dbTpl = await db.emailTemplate.findUnique({ where: { id } });
    if (dbTpl) {
      this.templateCache.set(dbTpl.name, dbTpl);
    }
    return dbTpl;
  }

  public static async listTemplates(options?: { category?: string; activeOnly?: boolean }): Promise<TemplateData[]> {
    const where: { category?: string; isActive?: boolean } = {};
    if (options?.category) where.category = options.category;
    if (options?.activeOnly) where.isActive = true;
    return db.emailTemplate.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  public static async createTemplate(data: {
    name: string;
    description?: string;
    subject: string;
    htmlBody: string;
    plainText?: string;
    category?: string;
  }): Promise<TemplateData> {
    this.validateTemplateSyntax(data.subject, data.htmlBody, data.plainText || '');
    const template = await db.emailTemplate.create({
      data: {
        name: data.name,
        description: data.description || null,
        subject: data.subject,
        htmlBody: data.htmlBody,
        plainText: data.plainText || null,
        category: data.category || 'system',
        isBuiltin: false,
        isActive: true
      }
    });
    this.templateCache.set(template.name, template);
    return template;
  }

  public static async updateTemplate(id: string, data: Partial<{
    name: string;
    description: string;
    subject: string;
    htmlBody: string;
    plainText: string;
    category: string;
    isActive: boolean;
  }>): Promise<TemplateData> {
    const existing = await this.getTemplateById(id);
    if (!existing) {
      throw new Error('Template not found');
    }
    const subject = data.subject !== undefined ? data.subject : existing.subject;
    const htmlBody = data.htmlBody !== undefined ? data.htmlBody : existing.htmlBody;
    const plainText = data.plainText !== undefined ? data.plainText : (existing.plainText || '');

    this.validateTemplateSyntax(subject, htmlBody, plainText);

    this.templateCache.delete(existing.name);
    const template = await db.emailTemplate.update({ where: { id }, data });
    this.templateCache.set(template.name, template);

    // Re-verify at runtime
    try {
      const dummyVars = this.getDummyVariables();
      await this.render(template, dummyVars);
      this.invalidTemplates.delete(template.name);
    } catch (err: any) {
      this.invalidTemplates.add(template.name);
    }

    return template;
  }

  public static async deleteTemplate(id: string): Promise<void> {
    const existing = await this.getTemplateById(id);
    if (existing) {
      this.templateCache.delete(existing.name);
      this.invalidTemplates.delete(existing.name);
    }
    await db.emailTemplate.delete({ where: { id } });
  }

  public static async restoreBuiltin(name: string): Promise<TemplateData | null> {
    const builtin = builtinTemplates.find(t => t.name === name);
    if (!builtin) return null;

    const template = await db.emailTemplate.upsert({
      where: { name },
      update: {
        subject: builtin.subject,
        htmlBody: builtin.htmlBody,
        plainText: builtin.plainText || null,
        description: builtin.description,
        category: builtin.category || 'system'
      },
      create: {
        name: builtin.name,
        description: builtin.description,
        subject: builtin.subject,
        htmlBody: builtin.htmlBody,
        plainText: builtin.plainText || null,
        category: builtin.category || 'system',
        isBuiltin: true,
        isActive: true
      }
    });

    this.templateCache.set(template.name, template);

    try {
      const dummyVars = this.getDummyVariables();
      await this.render(template, dummyVars);
      this.invalidTemplates.delete(template.name);
    } catch (err: any) {
      this.invalidTemplates.add(template.name);
    }

    return template;
  }

  public static validateTemplateSyntax(subject: string, htmlBody: string, plainText: string): void {
    // 1. Validate Email Size (< 2MB)
    const totalLength = subject.length + htmlBody.length + plainText.length;
    if (totalLength > 2 * 1024 * 1024) {
      throw new Error('Email size exceeds 2MB limit');
    }

    // 2. Validate Malformed HTML Tags
    // Check for unclosed tag brackets
    if (/<[^>]*$/g.test(htmlBody)) {
      throw new Error('Malformed HTML: Found unclosed tag bracket');
    }

    // Check for unclosed Mustache blocks
    const extractTags = (str: string): string[] => {
      const tags: string[] = [];
      const regex = /\{\{([#^/])([\w.]+)\}\}/g;
      let match;
      while ((match = regex.exec(str)) !== null) {
        tags.push(`${match[1]}${match[2]}`);
      }
      return tags;
    };

    const auditMustacheBlocks = (str: string, sectionName: string): void => {
      const tags = extractTags(str);
      const stack: string[] = [];
      for (const tag of tags) {
        if (tag.startsWith('#') || tag.startsWith('^')) {
          stack.push(tag.slice(1));
        } else if (tag.startsWith('/')) {
          const closing = tag.slice(1);
          const last = stack.pop();
          if (last !== closing) {
            throw new Error(`Malformed Template in ${sectionName}: Block {{#${last}}} was closed by {{/${closing}}}`);
          }
        }
      }
      if (stack.length > 0) {
        throw new Error(`Malformed Template in ${sectionName}: Block {{#${stack[0]}}} was never closed`);
      }
    };

    auditMustacheBlocks(subject, 'Subject');
    auditMustacheBlocks(htmlBody, 'HTML Body');
    auditMustacheBlocks(plainText, 'Plain Text');

    // 3. Validate image tags have source attributes
    if (/<img[^>]*>/gi.test(htmlBody)) {
      const imgRegex = /<img([^>]+)>/gi;
      let imgMatch;
      while ((imgMatch = imgRegex.exec(htmlBody)) !== null) {
        const attributes = imgMatch[1];
        if (!/src\s*=\s*['"]?([^'"]+)['"]?/i.test(attributes)) {
          throw new Error('Malformed HTML: Image tag missing src attribute');
        }
      }
    }
  }

  public static async render(template: TemplateData, variables: Record<string, unknown>): Promise<RenderedEmail> {
    const brandingVars = await EmailBrandingService.getBrandingVariables();
    const allVars: Record<string, unknown> = { ...variables, branding: brandingVars };

    this.validateTemplateSyntax(template.subject, template.htmlBody, template.plainText || '');

    // Extract all placeholders and check if any are undefined
    const extractPlaceholders = (str: string): string[] => {
      const placeholders: string[] = [];
      const regex = /\{\{([#^/]?)([\w.]+)\}\}/g;
      let match;
      while ((match = regex.exec(str)) !== null) {
        // If it's a closing tag or helper control like loop index, ignore
        if (match[1] === '/') continue;
        placeholders.push(match[2]);
      }
      return placeholders;
    };

    const placeholders = [
      ...extractPlaceholders(template.subject),
      ...extractPlaceholders(template.htmlBody),
      ...extractPlaceholders(template.plainText || '')
    ];

    const undefinedPlaceholders: string[] = [];
    for (const path of placeholders) {
      if (resolvePath(allVars, path) === undefined) {
        undefinedPlaceholders.push(path);
      }
    }

    if (undefinedPlaceholders.length > 0) {
      throw new Error(`Undefined placeholder variables: ${Array.from(new Set(undefinedPlaceholders)).join(', ')}`);
    }

    const interpolate = (str: string): string => {
      let result = str.replace(/\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, content) => {
        const val = resolvePath(allVars, key);
        if (val !== undefined && val !== null && val !== false && val !== '') {
          return this.renderSimple(content, allVars);
        }
        return '';
      });
      result = result.replace(/\{\{\^([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, content) => {
        const val = resolvePath(allVars, key);
        if (val === undefined || val === null || val === false || val === '') {
          return this.renderSimple(content, allVars);
        }
        return '';
      });
      result = result.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
        const val = resolvePath(allVars, key);
        return val !== undefined ? String(val) : '';
      });
      return result;
    };

    const renderedHtml = interpolate(template.htmlBody);
    if (!renderedHtml || renderedHtml.trim() === '') {
      throw new Error('Template rendering failed: HTML output is empty');
    }

    return {
      subject: interpolate(template.subject),
      html: renderedHtml,
      plainText: template.plainText ? interpolate(template.plainText) : ''
    };
  }

  private static renderSimple(str: string, variables: Record<string, unknown>): string {
    return str.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
      const val = resolvePath(variables, key);
      return val !== undefined ? String(val) : '';
    });
  }

  public static async renderByName(name: string, variables: Record<string, unknown>): Promise<RenderedEmail | null> {
    const template = await this.getTemplate(name);
    if (!template) return null;
    return this.render(template, variables);
  }
}