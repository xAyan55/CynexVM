import { db } from '../../db';

export interface BrandingData {
  id: string;
  panelName?: string | null;
  companyName?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  buttonColor: string;
  borderRadius: string;
  supportEmail?: string | null;
  websiteUrl?: string | null;
  companyAddress?: string | null;
  copyrightText?: string | null;
  footerHtml?: string | null;
  twitterUrl?: string | null;
  discordUrl?: string | null;
  githubUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  linkedinUrl?: string | null;
  footerLinks?: string | null;
  legalLinks?: string | null;
  unsubscribeText: string;
}

export interface BrandingVariables {
  panel_name: string;
  company_name: string;
  logo: string;
  favicon: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  button_color: string;
  border_radius: string;
  support_email: string;
  website: string;
  address: string;
  copyright: string;
  footer: string;
  twitter: string;
  discord: string;
  github: string;
  facebook: string;
  instagram: string;
  linkedin: string;
  year: number;
}

export class EmailBrandingService {
  private static cached: BrandingVariables | null = null;

  public static invalidateCache(): void {
    this.cached = null;
  }

  private static async loadPanelSettings(): Promise<Record<string, string>> {
    const rows = await db.setting.findMany({
      where: { key: { in: ['panel_name', 'logo_url', 'favicon_url', 'support_email'] } }
    });
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.key] = row.value;
    }
    return map;
  }

  public static async getBranding(): Promise<BrandingData | null> {
    const existing = await db.emailBranding.findFirst();
    if (!existing) {
      return this.createDefault();
    }
    return existing;
  }

  public static async createDefault(): Promise<BrandingData> {
    const panel = await this.loadPanelSettings();
    return db.emailBranding.create({
      data: {
        panelName: panel.panel_name || null,
        logoUrl: panel.logo_url || null,
        faviconUrl: panel.favicon_url || null,
        supportEmail: panel.support_email || null,
        primaryColor: '#2563eb',
        secondaryColor: '#6b7280',
        accentColor: '#059669',
        backgroundColor: '#f4f5f7',
        buttonColor: '#2563eb',
        borderRadius: '8px',
        unsubscribeText: 'You received this email because you have an account with this service.'
      }
    });
  }

  public static async upsertBranding(data: Partial<BrandingData> & { id?: string }): Promise<BrandingData> {
    this.invalidateCache();
    const existing = await db.emailBranding.findFirst();
    if (existing) {
      return db.emailBranding.update({ where: { id: existing.id }, data });
    }
    return db.emailBranding.create({ data: { ...data } as any });
  }

  public static async getBrandingVariables(): Promise<BrandingVariables> {
    if (this.cached) return this.cached;

    const panel = await this.loadPanelSettings();
    const branding = await db.emailBranding.findFirst();

    const resolve = (field: string | null | undefined, panelKey: string, def: string): string => {
      if (field) return field;
      if (panel[panelKey]) return panel[panelKey];
      return def;
    };

    const vars: BrandingVariables = {
      panel_name: resolve(branding?.panelName, 'panel_name', 'Portal'),
      company_name: branding?.companyName || '',
      logo: resolve(branding?.logoUrl, 'logo_url', ''),
      favicon: resolve(branding?.faviconUrl, 'favicon_url', ''),
      primary_color: branding?.primaryColor || '#2563eb',
      secondary_color: branding?.secondaryColor || '#6b7280',
      accent_color: branding?.accentColor || '#059669',
      background_color: branding?.backgroundColor || '#f4f5f7',
      button_color: branding?.buttonColor || '#2563eb',
      border_radius: branding?.borderRadius || '8px',
      support_email: resolve(branding?.supportEmail, 'support_email', ''),
      website: branding?.websiteUrl || '',
      address: branding?.companyAddress || '',
      copyright: branding?.copyrightText || '',
      footer: branding?.footerHtml || '',
      twitter: branding?.twitterUrl || '',
      discord: branding?.discordUrl || '',
      github: branding?.githubUrl || '',
      facebook: branding?.facebookUrl || '',
      instagram: branding?.instagramUrl || '',
      linkedin: branding?.linkedinUrl || '',
      year: new Date().getFullYear(),
    };

    this.cached = vars;
    return vars;
  }

  public static wrapWithBranding(
    contentHtml: string,
    branding: BrandingData,
    meta: { panelName: string; subject: string }
  ): string {
    const primaryColor = branding.primaryColor || '#2563eb';
    const logo = branding.logoUrl
      ? `<img src="${branding.logoUrl}" alt="${meta.panelName}" style="max-height:48px;margin-bottom:24px" />`
      : `<h1 style="font-size:24px;font-weight:700;color:#1a1a1a;margin:0 0 24px 0">${meta.panelName}</h1>`;

    let socialLinks = '';
    const socials: { url?: string | null; label: string; icon: string }[] = [
      { url: branding.twitterUrl, label: 'X', icon: '𝕏' },
      { url: branding.facebookUrl, label: 'Facebook', icon: 'f' },
      { url: branding.linkedinUrl, label: 'LinkedIn', icon: 'in' },
      { url: branding.githubUrl, label: 'GitHub', icon: 'GH' },
      { url: branding.discordUrl, label: 'Discord', icon: 'DC' },
      { url: branding.instagramUrl, label: 'Instagram', icon: 'IG' },
    ];
    const validSocials = socials.filter(s => s.url);
    if (validSocials.length > 0) {
      socialLinks = validSocials.map(s =>
        `<a href="${s.url}" style="color:#6b7280;text-decoration:none;margin:0 6px;font-size:12px">${s.icon}</a>`
      ).join('');
    }

    const footerHtml = branding.footerHtml
      ? branding.footerHtml
      : '';

    const companyInfo = branding.companyName
      ? `<p style="margin:4px 0;font-size:12px;color:#6b7280">${branding.companyName}${branding.companyAddress ? ` &middot; ${branding.companyAddress}` : ''}</p>`
      : '';

    const copyright = branding.copyrightText
      ? `<p style="margin:4px 0;font-size:11px;color:#9ca3af">${branding.copyrightText}</p>`
      : '';

    const unsubscribeHtml = branding.unsubscribeText
      ? `<p style="margin:16px 0 0 0;font-size:11px;color:#9ca3af">${branding.unsubscribeText}</p>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <style>
    @media only screen and (max-width:600px){.container{width:100%!important}.content{padding:24px 16px!important}}
    body{margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif}
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f4f5f7;padding:40px 0">
    <tr>
      <td align="center">
        <table class="container" role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
          <tr>
            <td class="content" style="padding:32px 40px">
              ${logo}
              ${contentHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;text-align:center">
              ${footerHtml}
              ${companyInfo}
              ${copyright}
              ${socialLinks ? `<p style="margin:12px 0 0 0">${socialLinks}</p>` : ''}
              ${unsubscribeHtml}
            </td>
          </tr>
        </table>
        <p style="font-size:11px;color:#9ca3af;margin-top:12px;text-align:center">&copy; ${new Date().getFullYear()} ${meta.panelName}. All rights reserved.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}