import { Router } from 'express';
import { db } from '../db';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { EmailService } from '../services/email/emailService';
import { EmailTemplateService } from '../services/email/emailTemplateService';
import { EmailQueue } from '../services/email/emailQueue';
import { EmailLogService } from '../services/email/emailLogService';
import { EmailBrandingService, BrandingData } from '../services/email/emailBrandingService';
import { EmailRateLimiter } from '../services/email/emailRateLimiter';

const router = Router();

// ============================================================
// SMTP Configuration Routes
// ============================================================

router.get('/smtp-configs', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const configs = await db.smtpConfig.findMany({ orderBy: { createdAt: 'desc' } });
    // Never expose encrypted passwords
    const sanitized = configs.map(c => ({
      id: c.id,
      name: c.name,
      host: c.host,
      port: c.port,
      username: c.username,
      encryption: c.encryption,
      senderName: c.senderName,
      senderEmail: c.senderEmail,
      replyTo: c.replyTo,
      isDefault: c.isDefault,
      isVerified: c.isVerified,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }));
    return res.status(200).json(sanitized);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch SMTP configs' });
  }
});

router.post('/smtp-configs', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { name, host, port, username, password, encryption, senderName, senderEmail, replyTo, isDefault } = req.body;
    if (!host || !username || !password || !senderName || !senderEmail) {
      return res.status(400).json({ error: 'Missing required fields: host, username, password, senderName, senderEmail' });
    }

    const encryptedPassword = await EmailService.encryptPassword(password);

    if (isDefault) {
      await db.smtpConfig.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }

    const config = await db.smtpConfig.create({
      data: {
        name: name || 'Default',
        host,
        port: port || 587,
        username,
        encryptedPassword,
        encryption: encryption || 'starttls',
        senderName,
        senderEmail,
        replyTo: replyTo || null,
        isDefault: isDefault || false
      }
    });

    EmailService.clearCache();

    return res.status(201).json({
      id: config.id,
      name: config.name,
      host: config.host,
      port: config.port,
      username: config.username,
      encryption: config.encryption,
      senderName: config.senderName,
      senderEmail: config.senderEmail,
      replyTo: config.replyTo,
      isDefault: config.isDefault,
      isVerified: config.isVerified
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to create SMTP config: ' + err.message });
  }
});

router.put('/smtp-configs/:id', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const existing = await db.smtpConfig.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'SMTP config not found' });

    const { name, host, port, username, password, encryption, senderName, senderEmail, replyTo, isDefault } = req.body;

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (host !== undefined) data.host = host;
    if (port !== undefined) data.port = port;
    if (username !== undefined) data.username = username;
    if (password) data.encryptedPassword = await EmailService.encryptPassword(password);
    if (encryption !== undefined) data.encryption = encryption;
    if (senderName !== undefined) data.senderName = senderName;
    if (senderEmail !== undefined) data.senderEmail = senderEmail;
    if (replyTo !== undefined) data.replyTo = replyTo;

    if (isDefault) {
      await db.smtpConfig.updateMany({ where: { isDefault: true, id: { not: req.params.id } }, data: { isDefault: false } });
      data.isDefault = true;
    } else if (isDefault === false) {
      data.isDefault = false;
    }

    const config = await db.smtpConfig.update({ where: { id: req.params.id }, data });

    EmailService.clearCache(config.id);

    return res.status(200).json({
      id: config.id,
      name: config.name,
      host: config.host,
      port: config.port,
      username: config.username,
      encryption: config.encryption,
      senderName: config.senderName,
      senderEmail: config.senderEmail,
      replyTo: config.replyTo,
      isDefault: config.isDefault,
      isVerified: config.isVerified
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update SMTP config: ' + err.message });
  }
});

router.delete('/smtp-configs/:id', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const config = await db.smtpConfig.findUnique({ where: { id: req.params.id } });
    if (!config) return res.status(404).json({ error: 'SMTP config not found' });

    await db.smtpConfig.delete({ where: { id: req.params.id } });
    EmailService.clearCache(req.params.id);

    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete SMTP config' });
  }
});

router.post('/smtp-configs/:id/test', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const config = await db.smtpConfig.findUnique({ where: { id: req.params.id } });
    if (!config) return res.status(404).json({ error: 'SMTP config not found' });

    const result = await EmailService.testConnection(config);

    if (result.success) {
      await db.smtpConfig.update({ where: { id: req.params.id }, data: { isVerified: true } });
    }

    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/smtp-configs/:id/test-send', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const config = await db.smtpConfig.findUnique({ where: { id: req.params.id } });
    if (!config) return res.status(404).json({ error: 'SMTP config not found' });

    const testEmail = req.body.to || config.senderEmail;
    const branding = await EmailBrandingService.getBrandingVariables();
    const panelName = branding.panel_name;

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

    const result = await EmailService.sendRaw({
      to: testEmail,
      subject: `Test Email from ${panelName}`,
      html,
      plainText: `SMTP Test Successful\n\nServer: ${config.host}:${config.port}\nUsername: ${config.username}\nEncryption: ${config.encryption}\nSent: ${new Date().toISOString()}`,
      smtpConfigId: config.id
    });

    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Email Template Routes
// ============================================================

router.get('/templates', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const category = req.query.category as string;
    const templates = await EmailTemplateService.listTemplates({ category, activeOnly: false });
    return res.status(200).json(templates);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.get('/templates/:name', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const template = await EmailTemplateService.getTemplate(req.params.name);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    return res.status(200).json(template);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch template' });
  }
});

router.post('/templates', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { name, description, subject, htmlBody, plainText, category } = req.body;
    if (!name || !subject || !htmlBody) {
      return res.status(400).json({ error: 'Missing required fields: name, subject, htmlBody' });
    }
    const template = await EmailTemplateService.createTemplate({ name, description, subject, htmlBody, plainText, category });
    return res.status(201).json(template);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to create template: ' + err.message });
  }
});

router.put('/templates/:id', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { name, description, subject, htmlBody, plainText, category, isActive } = req.body;
    const template = await EmailTemplateService.updateTemplate(req.params.id, { name, description, subject, htmlBody, plainText, category, isActive });
    return res.status(200).json(template);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update template' });
  }
});

router.delete('/templates/:id', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    await EmailTemplateService.deleteTemplate(req.params.id);
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete template' });
  }
});

router.post('/templates/:name/restore', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const template = await EmailTemplateService.restoreBuiltin(req.params.name);
    if (!template) return res.status(404).json({ error: 'Builtin template not found' });
    return res.status(200).json(template);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to restore builtin template' });
  }
});

router.post('/templates/:name/preview', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { variables } = req.body;
    const rendered = await EmailTemplateService.renderByName(req.params.name, variables || {});
    if (!rendered) return res.status(404).json({ error: 'Template not found' });
    return res.status(200).json(rendered);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to render template' });
  }
});

// ============================================================
// Email Log Routes
// ============================================================

router.get('/logs', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const status = req.query.status as string;
    const search = req.query.q as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    const result = await EmailLogService.listLogs({ page, limit, status, search, startDate, endDate });
    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch email logs' });
  }
});

router.get('/logs/:id', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const log = await EmailLogService.getLogById(req.params.id);
    if (!log) return res.status(404).json({ error: 'Log not found' });
    return res.status(200).json(log);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch log' });
  }
});

router.delete('/logs/:id', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const ok = await EmailLogService.deleteLog(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Log not found' });
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete log' });
  }
});

router.post('/logs/:id/resend', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const ok = await EmailLogService.resendEmail(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Email log not found' });
    return res.status(200).json({ success: true, message: 'Email requeued for delivery' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to resend email' });
  }
});

// ============================================================
// Email Analytics Routes
// ============================================================

router.get('/analytics', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const days = parseInt(req.query.days as string) || 30;
    const analytics = await EmailLogService.getAnalytics({ days });
    const queueStats = await EmailQueue.getStats();
    return res.status(200).json({ ...analytics, queue: queueStats });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ============================================================
// Email Queue Routes
// ============================================================

router.get('/queue/stats', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const stats = await EmailQueue.getStats();
    return res.status(200).json(stats);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch queue stats' });
  }
});

router.post('/queue/retry/:id', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const ok = await EmailQueue.retryFailed(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Email not found or not in failed state' });
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retry email' });
  }
});

router.post('/queue/retry-all', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const count = await EmailQueue.retryAllFailed();
    return res.status(200).json({ success: true, count });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retry all' });
  }
});

// ============================================================
// Email Branding Routes
// ============================================================

router.get('/branding', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const branding = await EmailBrandingService.getBranding();
    return res.status(200).json(branding || {});
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch branding' });
  }
});

router.get('/branding/variables', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const vars = await EmailBrandingService.getBrandingVariables();
    return res.status(200).json(vars);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch branding variables' });
  }
});

router.put('/branding', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const branding = await EmailBrandingService.upsertBranding(req.body);
    return res.status(200).json(branding);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update branding' });
  }
});

// ============================================================
// Send Arbitrary Email (Admin)
// ============================================================

router.post('/send', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { to, subject, html, plainText, smtpConfigId } = req.body;
    if (!to || !subject || !html) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, html' });
    }

    const rateCheck = EmailRateLimiter.checkGlobalRate();
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: rateCheck.reason });
    }

    const queuedId = await EmailQueue.enqueue({
      to, subject, html, plainText, metadata: { manual: true }
    });

    return res.status(201).json({ success: true, id: queuedId, message: 'Email queued for delivery' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to send email' });
  }
});

export default router;
