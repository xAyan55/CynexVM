import { db } from '../../db';

export interface BrandingData {
  id: string;
  logoUrl?: string | null;
  primaryColor: string;
  footerText?: string | null;
  footerHtml?: string | null;
  companyName?: string | null;
  companyAddress?: string | null;
  twitterUrl?: string | null;
  facebookUrl?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  unsubscribeText: string;
}

export class EmailBrandingService {
  public static async getBranding(): Promise<BrandingData | null> {
    const branding = await db.emailBranding.findFirst();
    return branding;
  }

  public static async upsertBranding(data: Partial<BrandingData> & { id?: string }): Promise<BrandingData> {
    const existing = await db.emailBranding.findFirst();
    if (existing) {
      return db.emailBranding.update({
        where: { id: existing.id },
        data
      });
    }
    return db.emailBranding.create({
      data: {
        logoUrl: data.logoUrl || null,
        primaryColor: data.primaryColor || '#2563eb',
        footerText: data.footerText || null,
        footerHtml: data.footerHtml || null,
        companyName: data.companyName || null,
        companyAddress: data.companyAddress || null,
        twitterUrl: data.twitterUrl || null,
        facebookUrl: data.facebookUrl || null,
        linkedinUrl: data.linkedinUrl || null,
        githubUrl: data.githubUrl || null,
        unsubscribeText: data.unsubscribeText || 'You received this email because you have an account with {{panel_name}}. To manage preferences, visit your Profile Settings.'
      }
    });
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
      { url: branding.twitterUrl, label: 'Twitter', icon: '𝕏' },
      { url: branding.facebookUrl, label: 'Facebook', icon: 'f' },
      { url: branding.linkedinUrl, label: 'LinkedIn', icon: 'in' },
      { url: branding.githubUrl, label: 'GitHub', icon: 'GH' },
    ];
    const validSocials = socials.filter(s => s.url);
    if (validSocials.length > 0) {
      socialLinks = validSocials.map(s =>
        `<a href="${s.url}" style="color:#6b7280;text-decoration:none;margin:0 6px;font-size:12px">${s.icon}</a>`
      ).join('');
    }

    const footerHtml = branding.footerHtml || branding.footerText
      ? `<p style="margin:4px 0;font-size:12px;color:#6b7280">${branding.footerHtml || branding.footerText}</p>`
      : '';

    const companyInfo = branding.companyName
      ? `<p style="margin:4px 0;font-size:12px;color:#6b7280">${branding.companyName}${branding.companyAddress ? ` &middot; ${branding.companyAddress}` : ''}</p>`
      : '';

    const unsubscribeHtml = branding.unsubscribeText
      ? `<p style="margin:16px 0 0 0;font-size:11px;color:#9ca3af">${branding.unsubscribeText.replace(/\{\{panel_name\}\}/g, meta.panelName)}</p>`
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
