import { Router } from 'express';
import { db } from '../db';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { EmailService, SmtpConfigData } from '../services/email/emailService';
import { EmailTemplateService } from '../services/email/emailTemplateService';
import { EmailQueue } from '../services/email/emailQueue';
import { EmailLogService } from '../services/email/emailLogService';
import { EmailBrandingService } from '../services/email/emailBrandingService';
import { EmailRateLimiter } from '../services/email/emailRateLimiter';

const router = Router();

// ============================================================
// SMTP Configuration Routes
// ============================================================

router.get('/smtp-configs', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const configs = await db.smtpConfig.findMany({ orderBy: { createdAt: 'desc' } });
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
      enableIpv6: c.enableIpv6,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }));
    return res.status(200).json(sanitized);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch SMTP configs' });
  }
});

router.post('/smtp-configs', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { name, host, port, username, password, encryption, senderName, senderEmail, replyTo, isDefault, enableIpv6 } = req.body;
    
    // Check validation of basic fields first
    const validationError = EmailService.validateSmtpConfigFields({
      host, port, username, senderName, senderEmail
    });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }
    if (!password) {
      return res.status(400).json({ error: 'SMTP password is required' });
    }

    const encryptedPassword = await EmailService.encryptPassword(password);
    
    // Construct dummy config for verification check
    const candidateConfig: SmtpConfigData = {
      id: 'temp-verify-id',
      name: name || 'Default',
      host,
      port: Number(port),
      username,
      encryptedPassword,
      encryption: encryption || 'starttls',
      senderName,
      senderEmail,
      replyTo: replyTo || null,
      enableIpv6: !!enableIpv6
    };

    // Pre-save connection check
    const diagnostics = await EmailService.runDiagnostics(candidateConfig);
    if (!diagnostics.success) {
      return res.status(400).json({
        error: `Verification failed: ${diagnostics.error || 'SMTP Connection check failed'}`,
        diagnostics
      });
    }

    if (isDefault) {
      await db.smtpConfig.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }

    const config = await db.smtpConfig.create({
      data: {
        name: name || 'Default',
        host,
        port: Number(port),
        username,
        encryptedPassword,
        encryption: encryption || 'starttls',
        senderName,
        senderEmail,
        replyTo: replyTo || null,
        isDefault: !!isDefault,
        isVerified: true,
        enableIpv6: !!enableIpv6
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
      isVerified: config.isVerified,
      enableIpv6: config.enableIpv6
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

    const { name, host, port, username, password, encryption, senderName, senderEmail, replyTo, isDefault, enableIpv6 } = req.body;

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (host !== undefined) data.host = host;
    if (port !== undefined) data.port = Number(port);
    if (username !== undefined) data.username = username;
    if (password) {
      data.encryptedPassword = await EmailService.encryptPassword(password);
    } else {
      data.encryptedPassword = existing.encryptedPassword;
    }
    if (encryption !== undefined) data.encryption = encryption;
    if (senderName !== undefined) data.senderName = senderName;
    if (senderEmail !== undefined) data.senderEmail = senderEmail;
    if (replyTo !== undefined) data.replyTo = replyTo || null;
    if (enableIpv6 !== undefined) data.enableIpv6 = !!enableIpv6;

    // Create candidate for pre-save connection verification
    const candidateConfig: SmtpConfigData = {
      id: existing.id,
      name: data.name !== undefined ? data.name : existing.name,
      host: data.host !== undefined ? data.host : existing.host,
      port: data.port !== undefined ? Number(data.port) : existing.port,
      username: data.username !== undefined ? data.username : existing.username,
      encryptedPassword: data.encryptedPassword,
      encryption: data.encryption !== undefined ? data.encryption : existing.encryption,
      senderName: data.senderName !== undefined ? data.senderName : existing.senderName,
      senderEmail: data.senderEmail !== undefined ? data.senderEmail : existing.senderEmail,
      replyTo: data.replyTo !== undefined ? data.replyTo : (existing.replyTo || null),
      enableIpv6: data.enableIpv6 !== undefined ? data.enableIpv6 : existing.enableIpv6
    };

    const diagnostics = await EmailService.runDiagnostics(candidateConfig);
    if (!diagnostics.success) {
      return res.status(400).json({
        error: `Verification failed: ${diagnostics.error || 'SMTP Connection check failed'}`,
        diagnostics
      });
    }

    if (isDefault) {
      await db.smtpConfig.updateMany({ where: { isDefault: true, id: { not: req.params.id } }, data: { isDefault: false } });
      data.isDefault = true;
    } else if (isDefault === false) {
      data.isDefault = false;
    }

    // Set verified flag since diagnostics succeeded
    data.isVerified = true;

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
      isVerified: config.isVerified,
      enableIpv6: config.enableIpv6
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
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete SMTP config' });
  }
});

// Run diagnostics for a specific saved configuration
router.post('/smtp-configs/:id/test', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const config = await db.smtpConfig.findUnique({ where: { id: req.params.id } });
    if (!config) return res.status(404).json({ error: 'SMTP config not found' });

    const configData: SmtpConfigData = {
      ...config,
      replyTo: config.replyTo || null,
      enableIpv6: config.enableIpv6
    };

    const diagnostics = await EmailService.runDiagnostics(configData);
    const deliverability = await EmailService.runDeliverabilityChecks(config.senderEmail, config.host);

    if (diagnostics.success) {
      await db.smtpConfig.update({ where: { id: req.params.id }, data: { isVerified: true } });
    }

    return res.status(200).json({
      success: diagnostics.success,
      diagnostics,
      deliverability
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Run diagnostics for unsaved form settings (Auto-Discovery validation)
router.post('/smtp-configs/test', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { host, port, username, password, encryption, senderEmail, enableIpv6 } = req.body;
    if (!host || !username || !password || !senderEmail) {
      return res.status(400).json({ error: 'Missing required configuration fields' });
    }

    const encryptedPassword = await EmailService.encryptPassword(password);
    const candidateConfig: SmtpConfigData = {
      id: 'temp-diagnostics-id',
      name: 'Unsaved Test',
      host,
      port: Number(port),
      username,
      encryptedPassword,
      encryption: encryption || 'starttls',
      senderName: 'Test',
      senderEmail,
      enableIpv6: !!enableIpv6
    };

    const diagnostics = await EmailService.runDiagnostics(candidateConfig);
    const deliverability = await EmailService.runDeliverabilityChecks(senderEmail, host);

    return res.status(200).json({
      success: diagnostics.success,
      diagnostics,
      deliverability
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Send a test email for a saved configuration
router.post('/smtp-configs/:id/test-send', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const config = await db.smtpConfig.findUnique({ where: { id: req.params.id } });
    if (!config) return res.status(404).json({ error: 'SMTP config not found' });

    const testEmail = req.body.to || config.senderEmail;
    const configData: SmtpConfigData = {
      ...config,
      replyTo: config.replyTo || null,
      enableIpv6: config.enableIpv6
    };

    const result = await EmailService.testSendWithLogs(configData, testEmail);
    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Send a test email for unsaved configuration
router.post('/smtp-configs/test-send', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { host, port, username, password, encryption, senderName, senderEmail, enableIpv6, to } = req.body;
    if (!host || !username || !password || !senderEmail || !to) {
      return res.status(400).json({ error: 'Missing required configuration fields or recipient email' });
    }

    const encryptedPassword = await EmailService.encryptPassword(password);
    const candidateConfig: SmtpConfigData = {
      id: 'temp-send-id',
      name: 'Unsaved Test Email',
      host,
      port: Number(port),
      username,
      encryptedPassword,
      encryption: encryption || 'starttls',
      senderName: senderName || 'Test Mailer',
      senderEmail,
      enableIpv6: !!enableIpv6
    };

    const result = await EmailService.testSendWithLogs(candidateConfig, to);
    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Auto-Discovery Suggestion Endpoint
router.post('/smtp-configs/autodiscover', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email address is required' });
    const suggestion = EmailService.autoDiscoverSmtp(email);
    return res.status(200).json({ suggestion });
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
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.get('/templates/:name', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const template = await EmailTemplateService.getTemplate(req.params.name);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    return res.status(200).json(template);
  } catch (err) {
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
    return res.status(500).json({ error: 'Failed to update template: ' + err.message });
  }
});

router.delete('/templates/:id', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    await EmailTemplateService.deleteTemplate(req.params.id);
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete template' });
  }
});

router.post('/templates/:name/restore', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const template = await EmailTemplateService.restoreBuiltin(req.params.name);
    if (!template) return res.status(404).json({ error: 'Builtin template not found' });
    return res.status(200).json(template);
  } catch (err) {
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
    return res.status(500).json({ error: 'Failed to render template: ' + err.message });
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
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch email logs' });
  }
});

router.get('/logs/:id', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const log = await EmailLogService.getLogById(req.params.id);
    if (!log) return res.status(404).json({ error: 'Log not found' });
    return res.status(200).json(log);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch log' });
  }
});

router.delete('/logs/:id', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const ok = await EmailLogService.deleteLog(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Log not found' });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete log' });
  }
});

router.post('/logs/:id/resend', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const ok = await EmailLogService.resendEmail(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Email log not found' });
    return res.status(200).json({ success: true, message: 'Email requeued for delivery' });
  } catch (err) {
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
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ============================================================
// Email Queue Control Routes
// ============================================================

router.get('/queue/stats', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const stats = await EmailQueue.getStats();
    return res.status(200).json({
      ...stats,
      isPaused: EmailQueue.isPaused()
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch queue stats' });
  }
});

router.post('/queue/pause', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    EmailQueue.pause();
    return res.status(200).json({ success: true, isPaused: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/queue/resume', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    EmailQueue.resume();
    return res.status(200).json({ success: true, isPaused: false });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/queue/retry-dead', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const count = await EmailQueue.retryDeadLetters();
    return res.status(200).json({ success: true, count });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/queue/purge', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const count = await EmailQueue.purgeQueue();
    return res.status(200).json({ success: true, count });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/queue/cancel-pending', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const count = await EmailQueue.cancelPending();
    return res.status(200).json({ success: true, count });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/queue/clear-dead', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const count = await EmailQueue.clearDeadLetters();
    return res.status(200).json({ success: true, count });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/queue/retry/:id', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const ok = await EmailQueue.retryFailed(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Email not found or not in failed state' });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retry email' });
  }
});

router.post('/queue/retry-all', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const count = await EmailQueue.retryAllFailed();
    return res.status(200).json({ success: true, count });
  } catch (err) {
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
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch branding' });
  }
});

router.get('/branding/variables', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const vars = await EmailBrandingService.getBrandingVariables();
    return res.status(200).json(vars);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch branding variables' });
  }
});

router.put('/branding', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const branding = await EmailBrandingService.upsertBranding(req.body);
    return res.status(200).json(branding);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update branding' });
  }
});

// ============================================================
// Send Arbitrary Email (Admin)
// ============================================================

router.post('/send', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { to, subject, html, plainText } = req.body;
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
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send email' });
  }
});

export default router;
