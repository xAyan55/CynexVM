export interface BuiltinTemplate {
  name: string;
  description: string;
  subject: string;
  htmlBody: string;
  plainText?: string;
  category: string;
}

// ============================================================
// Design System Components
// ============================================================
// All classes (info-card, alert-*, muted, meta, divider, code-block)
// are defined in EmailBrandingService.wrapWithBranding()'s <style> block.
// ============================================================

function heading(text: string): string {
  return `<h1>${text}</h1>`;
}

function subheading(text: string): string {
  return `<h2>${text}</h2>`;
}

function body(text: string): string {
  return `<p>${text}</p>`;
}

function muted(text: string): string {
  return `<p class="muted">${text}</p>`;
}

function meta(text: string): string {
  return `<p class="meta">${text}</p>`;
}

function spacer(): string {
  return `<div style="height:8px"></div>`;
}

function divider(): string {
  return `<hr class="divider" />`;
}

function actionBtn(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0" align="center"><tr><td align="center" style="background-color:{{branding.button_color}};border-radius:12px"><a href="${url}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;line-height:20px;mso-hide:all">${label}</a></td></tr></table>`;
}

function textLink(fallbackUrl: string): string {
  return `<p class="muted">Or copy and paste this link into your browser:<br/><span style="color:#8a8a8a;word-break:break-all">${fallbackUrl}</span></p>`;
}

function infoCard(rows: string): string {
  return `<table class="info-card" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>`;
}

function infoRow(label: string, value: string): string {
  return `<tr><td class="label">${label}</td><td class="value">${value}</td></tr>`;
}

function successBox(content: string): string {
  return `<div class="alert alert-success">${content}</div>`;
}

function warningBox(content: string): string {
  return `<div class="alert alert-warning">${content}</div>`;
}

function dangerBox(content: string): string {
  return `<div class="alert alert-danger">${content}</div>`;
}

function infoBox(content: string): string {
  return `<div class="alert alert-info">${content}</div>`;
}

function codeBlock(code: string): string {
  return `<div class="code-block">${code}</div>`;
}

// ============================================================
// Built-in Email Templates
// ============================================================

export const builtinTemplates: BuiltinTemplate[] = [
  // ============================================================
  // SYSTEM TEMPLATES
  // ============================================================

  {
    name: 'welcome',
    description: 'Sent to new users after successful registration',
    category: 'system',
    subject: 'Welcome to {{branding.panel_name}}, {{username}}!',
    htmlBody:
      heading('Welcome aboard, {{username}}!') +
      body('Your account has been created successfully. You now have access to the {{branding.panel_name}} control panel where you can manage your virtual servers, monitor resources, and configure your infrastructure.') +
      actionBtn('{{branding.website}}', 'Go to Dashboard') +
      infoCard(
        infoRow('Username', '{{username}}') +
        infoRow('Email', '{{email}}') +
        infoRow('Registered', '{{date}}')
      ),
    plainText: `Welcome aboard, {{username}}!

Your account has been created successfully. You now have access to the {{branding.panel_name}} control panel.

Account Details:
- Username: {{username}}
- Email: {{email}}
- Registered: {{date}}

Go to Dashboard: {{branding.website}}`
    },

  {
    name: 'verify_email',
    description: 'Sent to verify a new email address',
    category: 'system',
    subject: 'Verify your email address - {{branding.panel_name}}',
    htmlBody:
      heading('Verify your email address') +
      body('Thanks for signing up, {{username}}! Please verify your email address to activate your account and start using the {{branding.panel_name}} control panel.') +
      actionBtn('{{verification_url}}', 'Verify Email Address') +
      textLink('{{verification_url}}') +
      muted('This link expires in {{expiry_hours}} hours. If you did not create an account, you can safely ignore this email.'),
    plainText: `Verify your email address

Thanks for signing up, {{username}}! Please verify your email address to activate your account.

Verification link: {{verification_url}}

This link expires in {{expiry_hours}} hours.`
  },

  {
    name: 'verify_email_code',
    description: 'Sent with a verification code for email confirmation',
    category: 'system',
    subject: 'Your verification code - {{branding.panel_name}}',
    htmlBody:
      heading('Verification code') +
      body('Use the following code to verify your email address:') +
      codeBlock('{{code}}') +
      muted('This code expires in {{expiry_minutes}} minutes. If you did not request this, you can safely ignore this email.'),
    plainText: `Your verification code: {{code}}

This code expires in {{expiry_minutes}} minutes.`
  },

  {
    name: 'reset_password',
    description: 'Sent when a user requests a password reset',
    category: 'system',
    subject: 'Reset your password - {{branding.panel_name}}',
    htmlBody:
      heading('Reset your password') +
      body('We received a request to reset the password for your {{branding.panel_name}} account. Click the button below to choose a new password.') +
      actionBtn('{{reset_url}}', 'Reset Password') +
      textLink('{{reset_url}}') +
      muted('This link expires in {{expiry_hours}} hours. If you did not request a password reset, you can safely ignore this email.'),
    plainText: `Reset your password

We received a request to reset the password for your {{branding.panel_name}} account.

Reset link: {{reset_url}}

This link expires in {{expiry_hours}} hours. If you did not request this, please ignore this email.`
  },

  {
    name: 'password_changed',
    description: 'Confirmation sent after a successful password change',
    category: 'system',
    subject: 'Your password has been changed - {{branding.panel_name}}',
    htmlBody:
      heading('Password changed successfully') +
      body('Your {{branding.panel_name}} account password was just changed.') +
      warningBox('<strong>Did not do this?</strong> If you did not change your password, please contact support immediately and review your account security settings.') +
      infoCard(
        infoRow('Time', '{{time}}') +
        infoRow('IP address', '{{ip}}') +
        infoRow('User agent', '{{user_agent}}')
      ),
    plainText: `Password changed successfully

Your {{branding.panel_name}} account password was just changed.
Time: {{time}}
IP address: {{ip}}

If you did not change your password, please contact support immediately.`
  },

  {
    name: 'email_changed',
    description: 'Confirmation sent when the account email is changed',
    category: 'system',
    subject: 'Your email address has been updated - {{branding.panel_name}}',
    htmlBody:
      heading('Email address updated') +
      body('Your {{branding.panel_name}} account email address has been changed.') +
      infoCard(
        infoRow('Previous', '{{old_email}}') +
        infoRow('New', '{{new_email}}') +
        infoRow('Time', '{{time}}') +
        infoRow('IP address', '{{ip}}')
      ) +
      warningBox('<strong>Did not request this?</strong> If you did not authorize this change, please contact support immediately.'),
    plainText: `Email address updated

Your {{branding.panel_name}} account email has been changed.
Previous: {{old_email}}
New: {{new_email}}
Time: {{time}}
IP address: {{ip}}

If you did not request this, contact support immediately.`
  },

  {
    name: 'account_locked',
    description: 'Sent when an account is locked due to too many failed attempts',
    category: 'system',
    subject: 'Account temporarily locked - {{branding.panel_name}}',
    htmlBody:
      heading('Account temporarily locked') +
      body('Your {{branding.panel_name}} account has been temporarily locked due to too many failed login attempts.') +
      dangerBox('<strong>{{attempts}}</strong> failed login attempts were detected from IP <strong>{{ip}}</strong>.') +
      muted('Your account will be automatically unlocked after {{lockout_minutes}} minutes. You can also reset your password using the forgot password link on the login page.'),
    plainText: `Account temporarily locked

Your {{branding.panel_name}} account has been temporarily locked due to too many failed login attempts.

{{attempts}} failed login attempts were detected from IP {{ip}}.

Your account will be automatically unlocked after {{lockout_minutes}} minutes.`
  },

  {
    name: 'login_alert',
    description: 'Alert sent on new login from an unrecognized device or location',
    category: 'system',
    subject: 'New sign-in to your account - {{branding.panel_name}}',
    htmlBody:
      heading('New sign-in detected') +
      body('A new sign-in was detected on your {{branding.panel_name}} account.') +
      infoCard(
        infoRow('Time', '{{time}}') +
        infoRow('IP address', '{{ip}}') +
        infoRow('Location', '{{location}}') +
        infoRow('Browser', '{{user_agent}}')
      ) +
      muted('If this was you, no action is needed. If you do not recognize this sign-in, change your password immediately.'),
    plainText: `New sign-in detected

A new sign-in was detected on your {{branding.panel_name}} account.
Time: {{time}}
IP address: {{ip}}
Location: {{location}}

If this was you, no action needed. Otherwise, change your password immediately.`
  },

  {
    name: 'two_factor_disabled',
    description: 'Sent when two-factor authentication is disabled',
    category: 'system',
    subject: 'Two-factor authentication disabled - {{branding.panel_name}}',
    htmlBody:
      heading('Two-factor authentication disabled') +
      body('Two-factor authentication was just disabled on your {{branding.panel_name}} account. Your account is now less secure.') +
      warningBox('If you did not authorize this, contact support immediately.') +
      infoCard(
        infoRow('Time', '{{time}}') +
        infoRow('IP address', '{{ip}}')
      ),
    plainText: `Two-factor authentication disabled

Two-factor authentication was just disabled on your {{branding.panel_name}} account.
Time: {{time}}
IP address: {{ip}}

Your account is now less secure. If you did not authorize this, contact support immediately.`
  },

  {
    name: 'two_factor_enabled',
    description: 'Sent when two-factor authentication is enabled',
    category: 'system',
    subject: 'Two-factor authentication enabled - {{branding.panel_name}}',
    htmlBody:
      heading('Two-factor authentication enabled') +
      body('Two-factor authentication was just enabled on your {{branding.panel_name}} account. Your account is now more secure.') +
      infoCard(
        infoRow('Time', '{{time}}') +
        infoRow('IP address', '{{ip}}')
      ) +
      muted('If you did not enable this, contact support immediately.'),
    plainText: `Two-factor authentication enabled

Two-factor authentication was just enabled on your {{branding.panel_name}} account.
Time: {{time}}
IP address: {{ip}}

If you did not enable this, contact support immediately.`
  },

  {
    name: 'api_key_created',
    description: 'Confirmation when a new API key is generated',
    category: 'system',
    subject: 'New API key created - {{branding.panel_name}}',
    htmlBody:
      heading('New API key created') +
      body('A new API key was generated for your {{branding.panel_name}} account.') +
      infoCard(
        infoRow('Key name', '{{key_name}}') +
        infoRow('Created', '{{time}}') +
        infoRow('IP address', '{{ip}}')
      ) +
      muted('If you did not create this key, revoke it immediately in your API settings.'),
    plainText: `New API key created

A new API key was generated for your {{branding.panel_name}} account.
Key name: {{key_name}}
Created: {{time}}
IP address: {{ip}}

If you did not create this key, revoke it immediately.`
  },

  {
    name: 'api_key_revoked',
    description: 'Confirmation when an API key is revoked',
    category: 'system',
    subject: 'API key revoked - {{branding.panel_name}}',
    htmlBody:
      heading('API key revoked') +
      body('An API key was revoked for your {{branding.panel_name}} account.') +
      infoCard(
        infoRow('Key name', '{{key_name}}') +
        infoRow('Revoked', '{{time}}') +
        infoRow('IP address', '{{ip}}')
      ),
    plainText: `API key revoked

An API key was revoked for your {{branding.panel_name}} account.
Key name: {{key_name}}
Revoked: {{time}}
IP address: {{ip}}`
  },

  // ============================================================
  // INSTANCE / VPS TEMPLATES
  // ============================================================

  {
    name: 'instance_created',
    description: 'Notification when a new instance is provisioned',
    category: 'transactional',
    subject: 'New container created: {{instance_name}} - {{branding.panel_name}}',
    htmlBody:
      heading('Container created') +
      body('Your new container has been provisioned and is ready to use.') +
      infoCard(
        infoRow('Name', '{{instance_name}}') +
        infoRow('OS', '{{os}}') +
        infoRow('CPU', '{{cpu}} cores') +
        infoRow('RAM', '{{ram}} MB') +
        infoRow('Storage', '{{storage}} GB') +
        infoRow('IP address', '{{ip_address}}') +
        infoRow('Node', '{{node}}')
      ) +
      actionBtn('{{branding.website}}/instances/{{instance_id}}', 'Manage Container'),
    plainText: `New container created: {{instance_name}}

Your new container has been provisioned.
Name: {{instance_name}}
OS: {{os}}
CPU: {{cpu}} cores
RAM: {{ram}} MB
Storage: {{storage}} GB
IP address: {{ip_address}}
Node: {{node}}

Manage: {{branding.website}}/instances/{{instance_id}}`
  },

  {
    name: 'instance_deleted',
    description: 'Confirmation when an instance is deleted',
    category: 'transactional',
    subject: 'Container deleted: {{instance_name}} - {{branding.panel_name}}',
    htmlBody:
      heading('Container deleted') +
      body('The container <strong>{{instance_name}}</strong> has been permanently deleted.') +
      infoCard(
        infoRow('Deleted', '{{time}}') +
        infoRow('IP address', '{{ip}}')
      ),
    plainText: `Container deleted: {{instance_name}}

The container has been permanently deleted.
Deleted: {{time}}
IP address: {{ip}}`
  },

  {
    name: 'instance_started',
    description: 'Notification when an instance is started',
    category: 'transactional',
    subject: 'Container started: {{instance_name}} - {{branding.panel_name}}',
    htmlBody:
      successBox('Container <strong>{{instance_name}}</strong> has been started successfully.') +
      actionBtn('{{branding.website}}/instances/{{instance_id}}', 'Open Console'),
    plainText: `Container started: {{instance_name}}

Container has been started successfully.`
  },

  {
    name: 'instance_stopped',
    description: 'Notification when an instance is stopped',
    category: 'transactional',
    subject: 'Container stopped: {{instance_name}} - {{branding.panel_name}}',
    htmlBody:
      warningBox('Container <strong>{{instance_name}}</strong> has been stopped.') +
      muted('If this was unexpected, you can start the container from the control panel.'),
    plainText: `Container stopped: {{instance_name}}`
  },

  {
    name: 'instance_rebooted',
    description: 'Notification when an instance is rebooted',
    category: 'transactional',
    subject: 'Container rebooted: {{instance_name}} - {{branding.panel_name}}',
    htmlBody:
      heading('Container rebooted') +
      body('Container <strong>{{instance_name}}</strong> has been rebooted successfully.'),
    plainText: `Container rebooted: {{instance_name}}`
  },

  {
    name: 'instance_suspended',
    description: 'Notification when an instance is suspended',
    category: 'transactional',
    subject: 'Container suspended: {{instance_name}} - {{branding.panel_name}}',
    htmlBody:
      dangerBox('Container <strong>{{instance_name}}</strong> has been suspended.') +
      infoCard(
        infoRow('Reason', '{{reason}}')
      ) +
      muted('If you believe this is an error, please contact support.'),
    plainText: `Container suspended: {{instance_name}}

Reason: {{reason}}
If you believe this is an error, please contact support.`
  },

  {
    name: 'instance_resource_alert',
    description: 'Alert when an instance exceeds resource thresholds',
    category: 'transactional',
    subject: 'Resource alert: {{instance_name}} - {{branding.panel_name}}',
    htmlBody:
      heading('Resource usage alert') +
      body('Container <strong>{{instance_name}}</strong> is exceeding resource thresholds.') +
      warningBox('<strong>{{resource}}</strong> usage is at <strong>{{usage_percent}}%</strong> ({{usage}} / {{limit}})') +
      muted('Consider upgrading your plan or optimizing your resource usage.'),
    plainText: `Resource usage alert

Container {{instance_name}} is exceeding resource thresholds.
{{resource}} usage is at {{usage_percent}}% ({{usage}} / {{limit}})

Consider upgrading your plan or optimizing your resource usage.`
  },

  {
    name: 'backup_completed',
    description: 'Notification when a backup completes successfully',
    category: 'transactional',
    subject: 'Backup completed: {{instance_name}} - {{branding.panel_name}}',
    htmlBody:
      successBox('A backup has been completed for container <strong>{{instance_name}}</strong>.') +
      infoCard(
        infoRow('Size', '{{size}}') +
        infoRow('Type', '{{backup_type}}') +
        infoRow('Completed', '{{time}}')
      ),
    plainText: `Backup completed: {{instance_name}}

Size: {{size}}
Type: {{backup_type}}
Completed: {{time}}`
  },

  {
    name: 'backup_failed',
    description: 'Notification when a backup fails',
    category: 'transactional',
    subject: 'Backup failed: {{instance_name}} - {{branding.panel_name}}',
    htmlBody:
      dangerBox('A backup attempt for container <strong>{{instance_name}}</strong> has failed.') +
      infoCard(
        infoRow('Error', '{{error}}')
      ) +
      muted('The system will retry automatically. You can also manually trigger a backup from the control panel.'),
    plainText: `Backup failed: {{instance_name}}

Error: {{error}}
The system will retry automatically.`
  },

  {
    name: 'deployment_completed',
    description: 'Notification when an OS deployment finishes',
    category: 'transactional',
    subject: 'Deployment completed: {{instance_name}} - {{branding.panel_name}}',
    htmlBody:
      successBox('OS deployment for container <strong>{{instance_name}}</strong> has completed successfully.') +
      infoCard(
        infoRow('OS', '{{os}}') +
        infoRow('Node', '{{node}}') +
        infoRow('Duration', '{{duration}}')
      ) +
      actionBtn('{{branding.website}}/instances/{{instance_id}}', 'Open Container'),
    plainText: `Deployment completed: {{instance_name}}

OS: {{os}}
Node: {{node}}
Duration: {{duration}}

Open Container: {{branding.website}}/instances/{{instance_id}}`
  },

  {
    name: 'deployment_failed',
    description: 'Notification when an OS deployment fails',
    category: 'transactional',
    subject: 'Deployment failed: {{instance_name}} - {{branding.panel_name}}',
    htmlBody:
      dangerBox('OS deployment for container <strong>{{instance_name}}</strong> has failed.') +
      infoCard(
        infoRow('Error', '{{error}}')
      ) +
      muted('Please try again or choose a different OS template.'),
    plainText: `Deployment failed: {{instance_name}}

Error: {{error}}
Please try again or choose a different OS template.`
  },

  // ============================================================
  // NODE TEMPLATES
  // ============================================================

  {
    name: 'node_offline',
    description: 'Alert when a compute node goes offline',
    category: 'transactional',
    subject: 'ALERT: Node offline - {{node_name}} - {{branding.panel_name}}',
    htmlBody:
      dangerBox('Hypervisor node <strong>{{node_name}}</strong> has gone offline or become unreachable.') +
      infoCard(
        infoRow('Node', '{{node_name}}') +
        infoRow('Last seen', '{{last_seen}}') +
        infoRow('Containers affected', '{{container_count}}')
      ) +
      muted('The system will continue attempting to reconnect. Please investigate the node status immediately.'),
    plainText: `ALERT: Node offline - {{node_name}}

Node {{node_name}} has gone offline.
Last seen: {{last_seen}}
Containers affected: {{container_count}}

Investigate immediately.`
  },

  {
    name: 'node_online',
    description: 'Notification when a compute node comes back online',
    category: 'transactional',
    subject: 'Node online: {{node_name}} - {{branding.panel_name}}',
    htmlBody:
      successBox('Hypervisor node <strong>{{node_name}}</strong> is back online and operational.') +
      infoCard(
        infoRow('Reconnected', '{{time}}')
      ),
    plainText: `Node online: {{node_name}}

Hypervisor node {{node_name}} is back online.`
  },

  {
    name: 'node_resource_alert',
    description: 'Alert when a node exceeds critical resource thresholds',
    category: 'transactional',
    subject: 'Resource alert: Node {{node_name}} - {{branding.panel_name}}',
    htmlBody:
      dangerBox('Hypervisor node <strong>{{node_name}}</strong> is exceeding critical resource thresholds.') +
      warningBox('<strong>{{resource}}</strong> at <strong>{{usage_percent}}%</strong> usage') +
      muted('Consider migrating containers or scaling your infrastructure.'),
    plainText: `Resource alert: Node {{node_name}}

Node {{node_name}} is exceeding critical resource thresholds.
{{resource}} at {{usage_percent}}% usage.

Consider migrating containers or scaling your infrastructure.`
  },

  // ============================================================
  // MAINTENANCE & ANNOUNCEMENT
  // ============================================================

  {
    name: 'maintenance_notice',
    description: 'Notification about scheduled maintenance',
    category: 'system',
    subject: 'Scheduled maintenance - {{branding.panel_name}}',
    htmlBody:
      heading('Scheduled maintenance') +
      body('We will be performing scheduled maintenance on {{branding.panel_name}}. During this time, some services may be temporarily unavailable.') +
      infoCard(
        infoRow('Start', '{{start_time}}') +
        infoRow('End', '{{end_time}}') +
        infoRow('Expected downtime', '{{duration}}')
      ) +
      body('{{details}}'),
    plainText: `Scheduled maintenance

We will be performing scheduled maintenance on {{branding.panel_name}}.
Start: {{start_time}}
End: {{end_time}}
Expected downtime: {{duration}}

{{details}}`
  },

  // ============================================================
  // BILLING TEMPLATES
  // ============================================================

  {
    name: 'invoice_created',
    description: 'Notification when a new invoice is generated',
    category: 'transactional',
    subject: 'New invoice: #{{invoice_number}} - {{branding.panel_name}}',
    htmlBody:
      heading('New invoice') +
      body('A new invoice has been generated for your {{branding.panel_name}} account.') +
      infoCard(
        infoRow('Invoice number', '#{{invoice_number}}') +
        infoRow('Amount', '{{amount}} {{currency}}') +
        infoRow('Due date', '{{due_date}}') +
        infoRow('Status', '{{status}}')
      ) +
      actionBtn('{{branding.website}}/billing/invoices/{{invoice_id}}', 'View Invoice'),
    plainText: `New invoice: #{{invoice_number}}

A new invoice has been generated for your {{branding.panel_name}} account.
Amount: {{amount}} {{currency}}
Due date: {{due_date}}
Status: {{status}}

View Invoice: {{branding.website}}/billing/invoices/{{invoice_id}}`
  },

  {
    name: 'payment_received',
    description: 'Confirmation when a payment is received',
    category: 'transactional',
    subject: 'Payment received - {{branding.panel_name}}',
    htmlBody:
      successBox('Your payment has been received and processed successfully.') +
      infoCard(
        infoRow('Invoice number', '#{{invoice_number}}') +
        infoRow('Amount', '{{amount}} {{currency}}') +
        infoRow('Payment method', '{{payment_method}}') +
        infoRow('Date', '{{date}}')
      ),
    plainText: `Payment received

Your payment has been received and processed successfully.
Invoice number: #{{invoice_number}}
Amount: {{amount}} {{currency}}
Payment method: {{payment_method}}
Date: {{date}}`
  },

  {
    name: 'payment_failed',
    description: 'Notification when a payment fails',
    category: 'transactional',
    subject: 'Payment failed - {{branding.panel_name}}',
    htmlBody:
      dangerBox('We were unable to process your payment for invoice <strong>#{{invoice_number}}</strong>.') +
      infoCard(
        infoRow('Amount', '{{amount}} {{currency}}') +
        infoRow('Reason', '{{reason}}')
      ) +
      muted('Please update your payment method to avoid service interruption.') +
      actionBtn('{{branding.website}}/billing', 'Update Billing'),
    plainText: `Payment failed

We were unable to process your payment for invoice #{{invoice_number}}.
Amount: {{amount}} {{currency}}
Reason: {{reason}}

Please update your payment method to avoid service interruption.`
  },

  // ============================================================
  // SUPPORT / TICKET TEMPLATES
  // ============================================================

  {
    name: 'ticket_created',
    description: 'Confirmation when a support ticket is opened',
    category: 'transactional',
    subject: 'Support ticket created: #{{ticket_number}} - {{branding.panel_name}}',
    htmlBody:
      heading('Support ticket created') +
      body('Your support ticket has been created. Our team will get back to you as soon as possible.') +
      infoCard(
        infoRow('Ticket number', '#{{ticket_number}}') +
        infoRow('Subject', '{{ticket_subject}}') +
        infoRow('Priority', '{{priority}}') +
        infoRow('Status', '{{status}}')
      ),
    plainText: `Support ticket created: #{{ticket_number}}

Your support ticket has been created.
Subject: {{ticket_subject}}
Priority: {{priority}}
Status: {{status}}

We will respond to your inquiry as soon as possible.`
  },

  {
    name: 'ticket_reply',
    description: 'Notification when a support ticket receives a reply',
    category: 'transactional',
    subject: 'New reply: Ticket #{{ticket_number}} - {{branding.panel_name}}',
    htmlBody:
      heading('New reply on your ticket') +
      body('There is a new reply on your support ticket <strong>#{{ticket_number}}</strong>.') +
      infoCard(
        infoRow('From', '{{author}}') +
        infoRow('Message', '{{preview}}')
      ) +
      actionBtn('{{branding.website}}/support/tickets/{{ticket_id}}', 'View Reply'),
    plainText: `New reply: Ticket #{{ticket_number}}

There is a new reply on your support ticket.
{{author}} wrote: {{preview}}

View Reply: {{branding.website}}/support/tickets/{{ticket_id}}`
  },

  {
    name: 'ticket_closed',
    description: 'Notification when a support ticket is closed',
    category: 'transactional',
    subject: 'Ticket closed: #{{ticket_number}} - {{branding.panel_name}}',
    htmlBody:
      heading('Ticket closed') +
      body('Support ticket <strong>#{{ticket_number}}</strong> has been closed.') +
      muted('If you need further assistance, please reply to reopen the ticket or create a new one.'),
    plainText: `Ticket closed: #{{ticket_number}}

Support ticket has been closed.`
  },

  // ============================================================
  // TEST & NOTIFICATION TEMPLATES
  // ============================================================

  {
    name: 'test_email',
    description: 'Test email to verify SMTP configuration',
    category: 'system',
    subject: 'Test email from {{branding.panel_name}}',
    htmlBody:
      successBox('SMTP test successful!') +
      body('This is a test email to confirm that your SMTP configuration for {{branding.panel_name}} is working correctly.') +
      infoCard(
        infoRow('Server', '{{smtp_host}}:{{smtp_port}}') +
        infoRow('Username', '{{smtp_user}}') +
        infoRow('Encryption', '{{encryption}}') +
        infoRow('Sent', '{{time}}')
      ) +
      muted('If you received this email, your SMTP settings are configured correctly.'),
    plainText: `SMTP test successful

This is a test email from {{branding.panel_name}}.
Server: {{smtp_host}}:{{smtp_port}}
Username: {{smtp_user}}
Sent: {{time}}

If you received this email, your SMTP settings are configured correctly.`
  },

  {
    name: 'notification_alert',
    description: 'System notification alert sent via email from the notification system',
    category: 'system',
    subject: '[{{category}}] {{title}} - {{branding.panel_name}}',
    htmlBody:
      '{{^color}}' + heading('{{title}}') + '{{/color}}' +
      '{{#color}}' + `<h1 style="font-size:28px;font-weight:700;color:{{color}};margin:0 0 8px 0;line-height:1.3;letter-spacing:-0.5px">{{title}}</h1>` + '{{/color}}' +
      body('{{message}}') +
      '{{#action_url}}' + actionBtn('{{action_url}}', 'View Details') + '{{/action_url}}' +
      divider() +
      muted('This is an automated notification from {{branding.panel_name}}. Manage preferences in your Profile settings.') +
      meta('Event: {{category}} &middot; {{time}}'),
    plainText: `{{title}}

{{message}}

This is an automated notification from {{branding.panel_name}}.
Event: {{category}} - {{time}}

Manage preferences in your Profile settings.`
  },

  {
    name: 'announcement',
    description: 'System-wide announcement sent to all users or specific groups',
    category: 'system',
    subject: '{{announcement_title}} - {{branding.panel_name}}',
    htmlBody:
      heading('{{announcement_title}}') +
      body('{{announcement_message}}') +
      muted('{{announcement_footer}}'),
    plainText: `{{announcement_title}}

{{announcement_message}}

{{announcement_footer}}`
  },

  // ============================================================
  // TASK TEMPLATES
  // ============================================================

  {
    name: 'task_completed',
    description: 'Notification that a background task has completed',
    category: 'transactional',
    subject: 'Task completed: {{task_name}} - {{branding.panel_name}}',
    htmlBody:
      successBox('Background task <strong>{{task_name}}</strong> has completed successfully.') +
      infoCard(
        infoRow('Completed', '{{time}}') +
        infoRow('Duration', '{{duration}}')
      ),
    plainText: `Task completed: {{task_name}}

Background task has completed successfully.
Completed: {{time}}
Duration: {{duration}}`
  },

  {
    name: 'task_failed',
    description: 'Notification that a background task has failed',
    category: 'transactional',
    subject: 'Task failed: {{task_name}} - {{branding.panel_name}}',
    htmlBody:
      dangerBox('Background task <strong>{{task_name}}</strong> has failed.') +
      infoCard(
        infoRow('Error', '{{error}}')
      ) +
      muted('The system will retry automatically. Check the task logs for details.'),
    plainText: `Task failed: {{task_name}}

Background task has failed.
Error: {{error}}
The system will retry automatically.`
  },

  // ============================================================
  // SECURITY REPORT TEMPLATE
  // ============================================================

  {
    name: 'security_report',
    description: 'Periodic security summary report',
    category: 'system',
    subject: 'Security report - {{branding.panel_name}}',
    htmlBody:
      heading('Security report') +
      muted('Report period: {{period_start}} - {{period_end}}') +
      infoCard(
        infoRow('Logins', '{{login_count}}') +
        infoRow('Failed attempts', '{{failed_login_count}}') +
        infoRow('Password changes', '{{password_changes}}') +
        infoRow('API keys created', '{{api_keys_created}}') +
        infoRow('API keys revoked', '{{api_keys_revoked}}') +
        infoRow('Active sessions', '{{active_sessions}}')
      ) +
      muted('Review your account activity regularly to ensure no unauthorized access.'),
    plainText: `Security report - {{branding.panel_name}}

Period: {{period_start}} - {{period_end}}
Logins: {{login_count}}
Failed attempts: {{failed_login_count}}
Password changes: {{password_changes}}
API keys created: {{api_keys_created}}
API keys revoked: {{api_keys_revoked}}
Active sessions: {{active_sessions}}

Review your account activity regularly.`
  },
];
