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
        primaryColor: '#e5e5e5',
        secondaryColor: '#8a8a8a',
        accentColor: '#22c55e',
        backgroundColor: '#0f0f0f',
        buttonColor: '#e5e5e5',
        borderRadius: '12px',
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
      primary_color: branding?.primaryColor || '#e5e5e5',
      secondary_color: branding?.secondaryColor || '#8a8a8a',
      accent_color: branding?.accentColor || '#22c55e',
      background_color: branding?.backgroundColor || '#0f0f0f',
      button_color: branding?.buttonColor || '#e5e5e5',
      border_radius: branding?.borderRadius || '12px',
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

  private static getContrastText(bgColor: string): string {
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#0f0f0f' : '#ffffff';
  }

  public static wrapWithBranding(
    contentHtml: string,
    branding: BrandingData,
    meta: { panelName: string; subject: string }
  ): string {
    const panelName = meta.panelName;
    const buttonColor = branding.buttonColor || '#e5e5e5';
    const btnTextColor = this.getContrastText(buttonColor);

    const logoHtml = branding.logoUrl
      ? `<div style="text-align:center;margin-bottom:28px"><img src="${branding.logoUrl}" alt="${panelName}" style="max-height:36px;border:0;outline:none;display:inline-block" /></div>`
      : `<div style="text-align:center;margin-bottom:28px"><span style="font-size:17px;font-weight:700;color:#f0f0f0;letter-spacing:-0.3px">${panelName}</span></div>`;

    const socialItems: { url?: string | null; label: string }[] = [
      { url: branding.twitterUrl, label: 'X' },
      { url: branding.githubUrl, label: 'GitHub' },
      { url: branding.facebookUrl, label: 'Facebook' },
      { url: branding.linkedinUrl, label: 'LinkedIn' },
      { url: branding.discordUrl, label: 'Discord' },
      { url: branding.instagramUrl, label: 'Instagram' },
    ];
    const validSocials = socialItems.filter(s => s.url);
    const socialHtml = validSocials.length > 0
      ? `<p style="margin:16px 0 0 0">${validSocials.map(s => `<a href="${s.url}" style="color:#5a5a5a;text-decoration:none;margin:0 8px;font-size:13px">${s.label}</a>`).join('')}</p>`
      : '';

    const customFooter = branding.footerHtml || '';
    const supportHtml = branding.supportEmail
      ? `<p style="margin:0 0 4px 0"><a href="mailto:${branding.supportEmail}" style="color:#8a8a8a;text-decoration:none">${branding.supportEmail}</a></p>`
      : '';
    const websiteHtml = branding.websiteUrl
      ? `<p style="margin:0 0 4px 0"><a href="${branding.websiteUrl}" style="color:#8a8a8a;text-decoration:none">${branding.websiteUrl.replace(/^https?:\/\//, '')}</a></p>`
      : '';
    const companyHtml = branding.companyName
      ? `<p style="margin:0 0 4px 0;color:#5a5a5a">${branding.companyName}${branding.companyAddress ? ` &middot; ${branding.companyAddress}` : ''}</p>`
      : '';
    const copyrightText = branding.copyrightText || `&copy; ${new Date().getFullYear()} ${panelName}. All rights reserved.`;
    const unsubscribeHtml = branding.unsubscribeText
      ? `<p style="margin:16px 0 0 0;font-size:11px;color:#4a4a4a">${branding.unsubscribeText}</p>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
<meta name="color-scheme" content="dark" />
<meta name="format-detection" content="telephone=no" />
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{margin:0;padding:0;background-color:#0f0f0f;font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  h1{font-size:28px;font-weight:700;color:#f0f0f0;margin:0 0 8px 0;line-height:1.3;letter-spacing:-0.5px}
  h2{font-size:20px;font-weight:600;color:#f0f0f0;margin:0 0 12px 0;line-height:1.4;letter-spacing:-0.3px}
  h3{font-size:16px;font-weight:600;color:#f0f0f0;margin:0 0 8px 0}
  p{font-size:16px;line-height:1.7;color:#b5b5b5;margin:0 0 16px 0}
  a{color:#f0f0f0}
  .muted{font-size:14px;color:#8a8a8a;line-height:1.6}
  .meta{font-size:13px;color:#5a5a5a;line-height:1.5}
  .info-card{background-color:#141414;border:1px solid #2a2a2a;border-radius:12px;padding:20px;margin:24px 0}
  .info-card table{width:100%;border-collapse:collapse}
  .info-card tr:not(:last-child) td{border-bottom:1px solid #1f1f1f}
  .info-card td{padding:8px 0;font-size:14px;line-height:1.5;vertical-align:top}
  .info-card .label{color:#8a8a8a;width:35%;padding-right:12px}
  .info-card .value{color:#f0f0f0}
  .alert{border-radius:12px;padding:16px 20px;margin:24px 0;font-size:14px;line-height:1.6}
  .alert-success{background-color:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);color:#22c55e}
  .alert-warning{background-color:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);color:#f59e0b}
  .alert-danger{background-color:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#ef4444}
  .alert-info{background-color:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);color:#b5b5b5}
  .divider{height:1px;background-color:#2a2a2a;border:none;margin:28px 0}
  code{font-family:'SF Mono','Fira Code','Fira Mono',Menlo,Consolas,monospace;font-size:13px;background-color:#141414;border:1px solid #2a2a2a;border-radius:6px;padding:2px 6px;color:#e5e5e5;word-break:break-all}
  .code-block{background-color:#141414;border:1px solid #2a2a2a;border-radius:12px;padding:16px 20px;font-family:'SF Mono','Fira Code','Fira Mono',Menlo,Consolas,monospace;font-size:14px;line-height:1.6;color:#e5e5e5;word-break:break-all;margin:24px 0}
  @media only screen and (max-width:600px){
    .card{padding:0!important}
    .content{padding:24px 16px!important}
    .info-card td{display:block;width:100%!important;padding:4px 0!important;border:none!important}
    .info-card .label{padding-bottom:0!important}
  }
</style>
</head>
<body>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#0f0f0f;padding:40px 0">
<tr>
<td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%">
<tr>
<td>
<div style="background-color:#1a1a1a;border-radius:16px;border:1px solid #2a2a2a;box-shadow:0 4px 24px rgba(0,0,0,0.4)">
<div style="padding:32px">
${logoHtml}
${contentHtml}
</div>
<div style="padding:24px 32px;border-top:1px solid #2a2a2a">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>
<td style="text-align:center;font-size:13px;color:#5a5a5a">
${customFooter}
${supportHtml}
${websiteHtml}
${companyHtml}
${socialHtml}
<p style="margin:12px 0 0 0;font-size:11px;color:#4a4a4a">${copyrightText}</p>
${unsubscribeHtml}
</td>
</tr>
</table>
</div>
</div>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
  }
}