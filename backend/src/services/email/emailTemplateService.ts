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
    return db.emailTemplate.findUnique({ where: { name } });
  }

  public static async getTemplateById(id: string): Promise<TemplateData | null> {
    return db.emailTemplate.findUnique({ where: { id } });
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
    return db.emailTemplate.create({
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

    return db.emailTemplate.update({ where: { id }, data });
  }

  public static async deleteTemplate(id: string): Promise<void> {
    await db.emailTemplate.delete({ where: { id } });
  }

  public static async restoreBuiltin(name: string): Promise<TemplateData | null> {
    const builtin = builtinTemplates.find(t => t.name === name);
    if (!builtin) return null;

    return db.emailTemplate.upsert({
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
      const regex = /\{\{([#/])([\w.]+)\}\}/g;
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
        if (tag.startsWith('#')) {
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