import { db } from '../../db';
import { builtinTemplates } from './emailBuiltinTemplates';

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
    const where: any = {};
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

  public static render(template: TemplateData, variables: Record<string, any>): RenderedEmail {
    const interpolate = (str: string): string => {
      // Handle conditionals: {{#var}}content{{/var}} - renders content if var is truthy
      let result = str.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, content) => {
        if (variables[key] !== undefined && variables[key] !== null && variables[key] !== false && variables[key] !== '') {
          return this.renderSimple(content, variables);
        }
        return '';
      });
      // Handle inverted conditionals: {{^var}}content{{/var}} - renders content if var is falsy
      result = result.replace(/\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, content) => {
        if (variables[key] === undefined || variables[key] === null || variables[key] === false || variables[key] === '') {
          return this.renderSimple(content, variables);
        }
        return '';
      });
      // Handle simple variable replacement
      result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return variables[key] !== undefined ? String(variables[key]) : `{{${key}}}`;
      });
      return result;
    };

    return {
      subject: interpolate(template.subject),
      html: interpolate(template.htmlBody),
      plainText: template.plainText ? interpolate(template.plainText) : ''
    };
  }

  private static renderSimple(str: string, variables: Record<string, any>): string {
    return str.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return variables[key] !== undefined ? String(variables[key]) : `{{${key}}}`;
    });
  }

  public static async renderByName(name: string, variables: Record<string, any>): Promise<RenderedEmail | null> {
    const template = await this.getTemplate(name);
    if (!template) return null;
    return this.render(template, variables);
  }
}
