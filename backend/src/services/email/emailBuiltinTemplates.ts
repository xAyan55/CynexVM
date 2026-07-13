export interface BuiltinTemplate {
  name: string;
  description: string;
  subject: string;
  htmlBody: string;
  plainText?: string;
  category: string;
}

export const builtinTemplates: BuiltinTemplate[] = [
  {
    name: 'welcome',
    description: 'Sent to new users after successful registration',
    category: 'system',
    subject: 'Welcome to {{panel_name}}, {{username}}!',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:#1a1a1a;margin:0 0 8px 0">Welcome aboard, {{username}}!</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">Your account has been created successfully. You now have access to the {{panel_name}} control panel where you can manage your virtual servers, monitor resources, and configure your infrastructure.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0">
  <tr>
    <td align="center" style="background-color:#2563eb;border-radius:8px">
      <a href="{{panel_url}}" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">Go to Dashboard</a>
    </td>
  </tr>
</table>
<div style="margin-top:24px;padding:16px;background-color:#f9fafb;border-radius:8px;font-size:13px;color:#6b7280">
  <p style="margin:0 0 4px 0"><strong>Account Details</strong></p>
  <p style="margin:0">Username: {{username}}<br/>Email: {{email}}<br/>Registered: {{date}}</p>
</div>`,
    plainText: `Welcome aboard, {{username}}!

Your account has been created successfully. You now have access to the {{panel_name}} control panel.

Account Details:
- Username: {{username}}
- Email: {{email}}
- Registered: {{date}}

Go to Dashboard: {{panel_url}}`
  },
  {
    name: 'verify_email',
    description: 'Sent to verify a new email address',
    category: 'system',
    subject: 'Verify your email address - {{panel_name}}',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:#1a1a1a;margin:0 0 8px 0">Verify your email address</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">Thanks for signing up, {{username}}! Please verify your email address to activate your account.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0">
  <tr>
    <td align="center" style="background-color:#2563eb;border-radius:8px">
      <a href="{{verification_url}}" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">Verify Email Address</a>
    </td>
  </tr>
</table>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0 0">Or copy and paste this link in your browser:<br/><code style="font-size:12px;color:#2563eb;word-break:break-all">{{verification_url}}</code></p>
<p style="font-size:12px;color:#9ca3af;margin:16px 0 0 0">This link expires in {{expiry_hours}} hours.</p>`,
    plainText: `Verify your email address

Thanks for signing up, {{username}}! Please verify your email address to activate your account.

Verification link: {{verification_url}}

This link expires in {{expiry_hours}} hours.`
  },
  {
    name: 'verify_email_code',
    description: 'Sent with a verification code for email confirmation',
    category: 'system',
    subject: 'Your verification code - {{panel_name}}',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:#1a1a1a;margin:0 0 8px 0">Verification code</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">Use the following code to verify your email address:</p>
<div style="margin:24px 0;text-align:center">
  <div style="display:inline-block;padding:16px 48px;background-color:#f3f4f6;border-radius:12px;font-size:36px;font-weight:700;letter-spacing:12px;color:#1a1a1a;font-family:monospace">{{code}}</div>
</div>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0 0">This code expires in {{expiry_minutes}} minutes.</p>`,
    plainText: `Your verification code: {{code}}

This code expires in {{expiry_minutes}} minutes.`
  },
  {
    name: 'reset_password',
    description: 'Sent when a user requests a password reset',
    category: 'system',
    subject: 'Reset your password - {{panel_name}}',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:#1a1a1a;margin:0 0 8px 0">Reset your password</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">We received a request to reset the password for your {{panel_name}} account.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0">
  <tr>
    <td align="center" style="background-color:#2563eb;border-radius:8px">
      <a href="{{reset_url}}" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">Reset Password</a>
    </td>
  </tr>
</table>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0 0">Or copy and paste this link:<br/><code style="font-size:12px;color:#2563eb;word-break:break-all">{{reset_url}}</code></p>
<p style="font-size:12px;color:#9ca3af;margin:16px 0 0 0">This link expires in {{expiry_hours}} hours. If you did not request this, please ignore this email.</p>`,
    plainText: `Reset your password

We received a request to reset the password for your {{panel_name}} account.

Reset link: {{reset_url}}

This link expires in {{expiry_hours}} hours. If you did not request this, please ignore this email.`
  },
  {
    name: 'password_changed',
    description: 'Confirmation sent after a successful password change',
    category: 'system',
    subject: 'Your password has been changed - {{panel_name}}',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:#1a1a1a;margin:0 0 8px 0">Password changed successfully</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">Your {{panel_name}} account password was just changed.</p>
<div style="margin:24px 0;padding:16px;background-color:#fef3cd;border-radius:8px;font-size:13px;color:#856404">
  <strong>Didn't do this?</strong> If you did not change your password, please contact support immediately and review your account security settings.
</div>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0 0">Time: {{time}}<br/>IP Address: {{ip}}<br/>User Agent: {{user_agent}}</p>`,
    plainText: `Password changed successfully

Your {{panel_name}} account password was just changed.
Time: {{time}}
IP Address: {{ip}}

If you did not change your password, please contact support immediately.`
  },
  {
    name: 'email_changed',
    description: 'Confirmation sent when the account email is changed',
    category: 'system',
    subject: 'Your email address has been updated - {{panel_name}}',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:#1a1a1a;margin:0 0 8px 0">Email address updated</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">Your {{panel_name}} account email address has been changed.</p>
<div style="margin:24px 0;padding:16px;background-color:#f3f4f6;border-radius:8px;font-size:13px;color:#374151">
  <p style="margin:0 0 4px 0"><strong>Change details</strong></p>
  <p style="margin:0">Previous: {{old_email}}<br/>New: {{new_email}}<br/>Time: {{time}}<br/>IP: {{ip}}</p>
</div>
<div style="margin:24px 0;padding:16px;background-color:#fef3cd;border-radius:8px;font-size:13px;color:#856404">
  <strong>Didn't request this?</strong> Contact support immediately.
</div>`,
    plainText: `Email address updated

Your {{panel_name}} account email has been changed.
Previous: {{old_email}}
New: {{new_email}}
Time: {{time}}
IP: {{ip}}

If you did not request this, contact support immediately.`
  },
  {
    name: 'account_locked',
    description: 'Sent when an account is locked due to too many failed attempts',
    category: 'system',
    subject: 'Account temporarily locked - {{panel_name}}',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:#1a1a1a;margin:0 0 8px 0">Account temporarily locked</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">Your {{panel_name}} account has been temporarily locked due to too many failed login attempts.</p>
<div style="margin:24px 0;padding:16px;background-color:#fee2e2;border-radius:8px;font-size:13px;color:#991b1b">
  <strong>Security Notice:</strong> {{attempts}} failed login attempts were detected from IP {{ip}}.
</div>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0 0">Your account will be automatically unlocked after {{lockout_minutes}} minutes. You can also reset your password using the forgot password link on the login page.</p>`,
    plainText: `Account temporarily locked

Your {{panel_name}} account has been temporarily locked due to too many failed login attempts.

{{attempts}} failed login attempts were detected from IP {{ip}}.

Your account will be automatically unlocked after {{lockout_minutes}} minutes.`
  },
  {
    name: 'login_alert',
    description: 'Alert sent on new login from an unrecognized device/location',
    category: 'system',
    subject: 'New sign-in to your account - {{panel_name}}',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:#1a1a1a;margin:0 0 8px 0">New sign-in detected</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">A new sign-in was detected on your {{panel_name}} account.</p>
<div style="margin:24px 0;padding:16px;background-color:#f3f4f6;border-radius:8px;font-size:13px;color:#374151">
  <p style="margin:0 0 4px 0"><strong>Sign-in details</strong></p>
  <p style="margin:0">Time: {{time}}<br/>IP Address: {{ip}}<br/>Location: {{location}}<br/>Device: {{user_agent}}</p>
</div>
<p style="font-size:12px;color:#9ca3af;margin:16px 0 0 0">If this was you, no action needed. If you do not recognize this sign-in, change your password immediately.</p>`,
    plainText: `New sign-in detected

A new sign-in was detected on your {{panel_name}} account.
Time: {{time}}
IP: {{ip}}
Location: {{location}}

If this was you, no action needed. Otherwise, change your password immediately.`
  },
  {
    name: 'two_factor_disabled',
    description: 'Sent when two-factor authentication is disabled',
    category: 'system',
    subject: 'Two-factor authentication disabled - {{panel_name}}',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:#1a1a1a;margin:0 0 8px 0">Two-factor authentication disabled</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">Two-factor authentication was just disabled on your {{panel_name}} account.</p>
<div style="margin:24px 0;padding:16px;background-color:#fef3cd;border-radius:8px;font-size:13px;color:#856404">
  <strong>Security Notice:</strong> Your account is now less secure. If you did not authorize this, contact support immediately.
</div>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0 0">Time: {{time}}<br/>IP: {{ip}}</p>`,
    plainText: `Two-factor authentication disabled

Two-factor authentication was just disabled on your {{panel_name}} account.
Time: {{time}}
IP: {{ip}}

Your account is now less secure. If you did not authorize this, contact support immediately.`
  },
  {
    name: 'api_key_created',
    description: 'Confirmation when a new API key is generated',
    category: 'system',
    subject: 'New API key created - {{panel_name}}',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:#1a1a1a;margin:0 0 8px 0">New API key created</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">A new API key was generated for your {{panel_name}} account.</p>
<div style="margin:24px 0;padding:16px;background-color:#f3f4f6;border-radius:8px;font-size:13px;color:#374151">
  <p style="margin:0 0 4px 0"><strong>Key details</strong></p>
  <p style="margin:0">Name: {{key_name}}<br/>Created: {{time}}<br/>IP: {{ip}}</p>
</div>
<p style="font-size:12px;color:#9ca3af;margin:16px 0 0 0">If you did not create this key, revoke it immediately in your API settings.</p>`,
    plainText: `New API key created

A new API key was generated for your {{panel_name}} account.
Name: {{key_name}}
Created: {{time}}
IP: {{ip}}

If you did not create this key, revoke it immediately.`
  },
  {
    name: 'api_key_revoked',
    description: 'Confirmation when an API key is revoked',
    category: 'system',
    subject: 'API key revoked - {{panel_name}}',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:#1a1a1a;margin:0 0 8px 0">API key revoked</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">An API key was revoked for your {{panel_name}} account.</p>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0 0">Key: {{key_name}}<br/>Revoked: {{time}}<br/>IP: {{ip}}</p>`,
    plainText: `API key revoked

An API key was revoked for your {{panel_name}} account.
Key: {{key_name}}
Revoked: {{time}}
IP: {{ip}}`
  },
  {
    name: 'instance_created',
    description: 'Notification when a new instance is provisioned',
    category: 'transactional',
    subject: 'New container created: {{instance_name}} - {{panel_name}}',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:#1a1a1a;margin:0 0 8px 0">Container created</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">Your new container has been provisioned and is ready to use.</p>
<div style="margin:24px 0;padding:16px;background-color:#f3f4f6;border-radius:8px;font-size:13px;color:#374151">
  <p style="margin:0 0 4px 0"><strong>Container Details</strong></p>
  <p style="margin:0">Name: {{instance_name}}<br/>OS: {{os}}<br/>CPU: {{cpu}} cores<br/>RAM: {{ram}} MB<br/>Storage: {{storage}} GB<br/>IP: {{ip_address}}<br/>Node: {{node}}</p>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0">
  <tr>
    <td align="center" style="background-color:#2563eb;border-radius:8px">
      <a href="{{panel_url}}/instances/{{instance_id}}" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">Manage Container</a>
    </td>
  </tr>
</table>`,
    plainText: `New container created: {{instance_name}}

Your new container has been provisioned.
Name: {{instance_name}}
OS: {{os}}
CPU: {{cpu}} cores
RAM: {{ram}} MB
Storage: {{storage}} GB
IP: {{ip_address}}
Node: {{node}}

Manage: {{panel_url}}/instances/{{instance_id}}`
  },
  {
    name: 'instance_deleted',
    description: 'Confirmation when an instance is deleted',
    category: 'transactional',
    subject: 'Container deleted: {{instance_name}} - {{panel_name}}',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:#1a1a1a;margin:0 0 8px 0">Container deleted</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">The container <strong>{{instance_name}}</strong> has been permanently deleted.</p>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0 0">Deleted: {{time}}<br/>IP: {{ip}}</p>`,
    plainText: `Container deleted: {{instance_name}}

The container has been permanently deleted.
Deleted: {{time}}
IP: {{ip}}`
  },
  {
    name: 'instance_started',
    description: 'Notification when an instance is started',
    category: 'transactional',
    subject: 'Container started: {{instance_name}} - {{panel_name}}',
    htmlBody: `<h2 style="font-size:18px;font-weight:600;color:#059669;margin:0 0 8px 0">Container started</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">Container <strong>{{instance_name}}</strong> has been started successfully.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0">
  <tr>
    <td align="center" style="background-color:#2563eb;border-radius:8px">
      <a href="{{panel_url}}/instances/{{instance_id}}" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">Open Console</a>
    </td>
  </tr>
</table>`,
    plainText: `Container started: {{instance_name}}

Container has been started successfully.`
  },
  {
    name: 'instance_stopped',
    description: 'Notification when an instance is stopped',
    category: 'transactional',
    subject: 'Container stopped: {{instance_name}} - {{panel_name}}',
    htmlBody: `<h2 style="font-size:18px;font-weight:600;color:#d97706;margin:0 0 8px 0">Container stopped</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">Container <strong>{{instance_name}}</strong> has been stopped.</p>`,
    plainText: `Container stopped: {{instance_name}}`
  },
  {
    name: 'instance_rebooted',
    description: 'Notification when an instance is rebooted',
    category: 'transactional',
    subject: 'Container rebooted: {{instance_name}} - {{panel_name}}',
    htmlBody: `<h2 style="font-size:18px;font-weight:600;color:#2563eb;margin:0 0 8px 0">Container rebooted</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">Container <strong>{{instance_name}}</strong> has been rebooted successfully.</p>`,
    plainText: `Container rebooted: {{instance_name}}`
  },
  {
    name: 'instance_suspended',
    description: 'Notification when an instance is suspended',
    category: 'transactional',
    subject: 'Container suspended: {{instance_name}} - {{panel_name}}',
    htmlBody: `<h2 style="font-size:18px;font-weight:600;color:#dc2626;margin:0 0 8px 0">Container suspended</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">Container <strong>{{instance_name}}</strong> has been suspended.</p>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0 0">Reason: {{reason}}<br/>If you believe this is an error, please contact support.</p>`,
    plainText: `Container suspended: {{instance_name}}

Reason: {{reason}}
If you believe this is an error, please contact support.`
  },
  {
    name: 'instance_resource_alert',
    description: 'Alert when an instance exceeds resource thresholds',
    category: 'transactional',
    subject: 'Resource alert: {{instance_name}} - {{panel_name}}',
    htmlBody: `<h2 style="font-size:18px;font-weight:600;color:#dc2626;margin:0 0 8px 0">Resource usage alert</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">Container <strong>{{instance_name}}</strong> is exceeding resource thresholds.</p>
<div style="margin:24px 0;padding:16px;background-color:#fef3cd;border-radius:8px;font-size:13px;color:#856404">
  <p style="margin:0"><strong>{{resource}}</strong> usage is at <strong>{{usage_percent}}%</strong> ({{usage}} / {{limit}})</p>
</div>
<p style="font-size:12px;color:#9ca3af;margin:16px 0 0 0">Consider upgrading your plan or optimizing your resource usage.</p>`,
    plainText: `Resource usage alert

Container {{instance_name}} is exceeding resource thresholds.
{{resource}} usage is at {{usage_percent}}% ({{usage}} / {{limit}})

Consider upgrading your plan or optimizing your resource usage.`
  },
  {
    name: 'backup_completed',
    description: 'Notification when a backup completes successfully',
    category: 'transactional',
    subject: 'Backup completed: {{instance_name}} - {{panel_name}}',
    htmlBody: `<h2 style="font-size:18px;font-weight:600;color:#059669;margin:0 0 8px 0">Backup completed</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">A backup has been completed for container <strong>{{instance_name}}</strong>.</p>
<div style="margin:24px 0;padding:16px;background-color:#f3f4f6;border-radius:8px;font-size:13px;color:#374151">
  <p style="margin:0 0 4px 0"><strong>Backup Details</strong></p>
  <p style="margin:0">Size: {{size}}<br/>Type: {{backup_type}}<br/>Completed: {{time}}</p>
</div>`,
    plainText: `Backup completed: {{instance_name}}

Size: {{size}}
Type: {{backup_type}}
Completed: {{time}}`
  },
  {
    name: 'backup_failed',
    description: 'Notification when a backup fails',
    category: 'transactional',
    subject: 'Backup failed: {{instance_name}} - {{panel_name}}',
    htmlBody: `<h2 style="font-size:18px;font-weight:600;color:#dc2626;margin:0 0 8px 0">Backup failed</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">A backup attempt for container <strong>{{instance_name}}</strong> has failed.</p>
<div style="margin:24px 0;padding:16px;background-color:#fee2e2;border-radius:8px;font-size:13px;color:#991b1b">
  <p style="margin:0">Error: {{error}}</p>
</div>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0 0">The system will retry automatically. You can also manually trigger a backup from the control panel.</p>`,
    plainText: `Backup failed: {{instance_name}}

Error: {{error}}
The system will retry automatically.`
  },
  {
    name: 'deployment_completed',
    description: 'Notification when an OS deployment finishes',
    category: 'transactional',
    subject: 'Deployment completed: {{instance_name}} - {{panel_name}}',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:#059669;margin:0 0 8px 0">Deployment completed</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">OS deployment for container <strong>{{instance_name}}</strong> has completed successfully.</p>
<div style="margin:24px 0;padding:16px;background-color:#f3f4f6;border-radius:8px;font-size:13px;color:#374151">
  <p style="margin:0">OS: {{os}}<br/>Node: {{node}}<br/>Duration: {{duration}}</p>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0">
  <tr>
    <td align="center" style="background-color:#2563eb;border-radius:8px">
      <a href="{{panel_url}}/instances/{{instance_id}}" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">Open Container</a>
    </td>
  </tr>
</table>`,
    plainText: `Deployment completed: {{instance_name}}

OS: {{os}}
Node: {{node}}
Duration: {{duration}}

Open Container: {{panel_url}}/instances/{{instance_id}}`
  },
  {
    name: 'deployment_failed',
    description: 'Notification when an OS deployment fails',
    category: 'transactional',
    subject: 'Deployment failed: {{instance_name}} - {{panel_name}}',
    htmlBody: `<h2 style="font-size:18px;font-weight:600;color:#dc2626;margin:0 0 8px 0">Deployment failed</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">OS deployment for container <strong>{{instance_name}}</strong> has failed.</p>
<div style="margin:24px 0;padding:16px;background-color:#fee2e2;border-radius:8px;font-size:13px;color:#991b1b">
  <p style="margin:0">Error: {{error}}</p>
</div>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0 0">Please try again or choose a different OS template.</p>`,
    plainText: `Deployment failed: {{instance_name}}

Error: {{error}}
Please try again or choose a different OS template.`
  },
  {
    name: 'node_offline',
    description: 'Alert when a compute node goes offline',
    category: 'transactional',
    subject: 'ALERT: Node offline - {{node_name}} - {{panel_name}}',
    htmlBody: `<h2 style="font-size:18px;font-weight:600;color:#dc2626;margin:0 0 8px 0">Node offline</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">Hypervisor node <strong>{{node_name}}</strong> has gone offline or become unreachable.</p>
<div style="margin:24px 0;padding:16px;background-color:#fee2e2;border-radius:8px;font-size:13px;color:#991b1b">
  <p style="margin:0">Node: {{node_name}}<br/>Last seen: {{last_seen}}<br/>Containers affected: {{container_count}}</p>
</div>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0 0">The system will continue attempting to reconnect. Please investigate the node status immediately.</p>`,
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
    subject: 'Node online: {{node_name}} - {{panel_name}}',
    htmlBody: `<h2 style="font-size:18px;font-weight:600;color:#059669;margin:0 0 8px 0">Node online</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">Hypervisor node <strong>{{node_name}}</strong> is back online and operational.</p>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0 0">Reconnected: {{time}}</p>`,
    plainText: `Node online: {{node_name}}

Hypervisor node {{node_name}} is back online.`
  },
  {
    name: 'node_resource_alert',
    description: 'Alert when a node exceeds critical resource thresholds',
    category: 'transactional',
    subject: 'Resource alert: Node {{node_name}} - {{panel_name}}',
    htmlBody: `<h2 style="font-size:18px;font-weight:600;color:#dc2626;margin:0 0 8px 0">Node resource alert</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">Hypervisor node <strong>{{node_name}}</strong> is exceeding critical resource thresholds.</p>
<div style="margin:24px 0;padding:16px;background-color:#fef3cd;border-radius:8px;font-size:13px;color:#856404">
  <p style="margin:0"><strong>{{resource}}</strong> at <strong>{{usage_percent}}%</strong> usage</p>
</div>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0 0">Consider migrating containers or scaling your infrastructure.</p>`,
    plainText: `Resource alert: Node {{node_name}}

Node {{node_name}} is exceeding critical resource thresholds.
{{resource}} at {{usage_percent}}% usage.

Consider migrating containers or scaling your infrastructure.`
  },
  {
    name: 'maintenance_notice',
    description: 'Notification about scheduled maintenance',
    category: 'system',
    subject: 'Scheduled maintenance - {{panel_name}}',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:#d97706;margin:0 0 8px 0">Scheduled maintenance</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">We will be performing scheduled maintenance on {{panel_name}}.</p>
<div style="margin:24px 0;padding:16px;background-color:#f3f4f6;border-radius:8px;font-size:13px;color:#374151">
  <p style="margin:0 0 4px 0"><strong>Maintenance Window</strong></p>
  <p style="margin:0">Start: {{start_time}}<br/>End: {{end_time}}<br/>Expected downtime: {{duration}}</p>
</div>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0 0">{{details}}</p>`,
    plainText: `Scheduled maintenance

We will be performing scheduled maintenance.
Start: {{start_time}}
End: {{end_time}}
Expected downtime: {{duration}}

{{details}}`
  },
  {
    name: 'invoice_created',
    description: 'Notification when a new invoice is generated',
    category: 'transactional',
    subject: 'New invoice: #{{invoice_number}} - {{panel_name}}',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:#1a1a1a;margin:0 0 8px 0">New invoice</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">A new invoice has been generated for your {{panel_name}} account.</p>
<div style="margin:24px 0;padding:16px;background-color:#f3f4f6;border-radius:8px;font-size:13px;color:#374151">
  <p style="margin:0 0 4px 0"><strong>Invoice Details</strong></p>
  <p style="margin:0">Invoice #: {{invoice_number}}<br/>Amount: {{amount}} {{currency}}<br/>Due Date: {{due_date}}<br/>Status: {{status}}</p>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0">
  <tr>
    <td align="center" style="background-color:#2563eb;border-radius:8px">
      <a href="{{panel_url}}/billing/invoices/{{invoice_id}}" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">View Invoice</a>
    </td>
  </tr>
</table>`,
    plainText: `New invoice: #{{invoice_number}}

A new invoice has been generated.
Amount: {{amount}} {{currency}}
Due Date: {{due_date}}
Status: {{status}}

View Invoice: {{panel_url}}/billing/invoices/{{invoice_id}}`
  },
  {
    name: 'payment_received',
    description: 'Confirmation when a payment is received',
    category: 'transactional',
    subject: 'Payment received - {{panel_name}}',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:#059669;margin:0 0 8px 0">Payment received</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">Your payment has been received and processed successfully.</p>
<div style="margin:24px 0;padding:16px;background-color:#f3f4f6;border-radius:8px;font-size:13px;color:#374151">
  <p style="margin:0 0 4px 0"><strong>Payment Details</strong></p>
  <p style="margin:0">Invoice #: {{invoice_number}}<br/>Amount: {{amount}} {{currency}}<br/>Method: {{payment_method}}<br/>Date: {{date}}</p>
</div>`,
    plainText: `Payment received

Your payment has been received and processed.
Invoice #: {{invoice_number}}
Amount: {{amount}} {{currency}}
Method: {{payment_method}}
Date: {{date}}`
  },
  {
    name: 'payment_failed',
    description: 'Notification when a payment fails',
    category: 'transactional',
    subject: 'Payment failed - {{panel_name}}',
    htmlBody: `<h2 style="font-size:18px;font-weight:600;color:#dc2626;margin:0 0 8px 0">Payment failed</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">We were unable to process your payment for invoice <strong>#{{invoice_number}}</strong>.</p>
<div style="margin:24px 0;padding:16px;background-color:#fee2e2;border-radius:8px;font-size:13px;color:#991b1b">
  <p style="margin:0">Amount: {{amount}} {{currency}}<br/>Reason: {{reason}}</p>
</div>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0 0">Please update your payment method to avoid service interruption.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0">
  <tr>
    <td align="center" style="background-color:#2563eb;border-radius:8px">
      <a href="{{panel_url}}/billing" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">Update Billing</a>
    </td>
  </tr>
</table>`,
    plainText: `Payment failed

We were unable to process your payment for invoice #{{invoice_number}}.
Amount: {{amount}} {{currency}}
Reason: {{reason}}

Please update your payment method to avoid service interruption.`
  },
  {
    name: 'ticket_created',
    description: 'Confirmation when a support ticket is opened',
    category: 'transactional',
    subject: 'Support ticket created: #{{ticket_number}} - {{panel_name}}',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:#1a1a1a;margin:0 0 8px 0">Support ticket created</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">Your support ticket has been created successfully.</p>
<div style="margin:24px 0;padding:16px;background-color:#f3f4f6;border-radius:8px;font-size:13px;color:#374151">
  <p style="margin:0 0 4px 0"><strong>Ticket Details</strong></p>
  <p style="margin:0">Ticket #: {{ticket_number}}<br/>Subject: {{ticket_subject}}<br/>Priority: {{priority}}<br/>Status: {{status}}</p>
</div>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0 0">We will respond to your inquiry as soon as possible.</p>`,
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
    subject: 'New reply: Ticket #{{ticket_number}} - {{panel_name}}',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:#1a1a1a;margin:0 0 8px 0">New ticket reply</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">There is a new reply on your support ticket <strong>#{{ticket_number}}</strong>.</p>
<div style="margin:24px 0;padding:16px;background-color:#f3f4f6;border-radius:8px;font-size:13px;color:#374151">
  <p style="margin:0"><strong>{{author}}</strong> wrote:<br/>{{preview}}</p>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0">
  <tr>
    <td align="center" style="background-color:#2563eb;border-radius:8px">
      <a href="{{panel_url}}/support/tickets/{{ticket_id}}" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">View Reply</a>
    </td>
  </tr>
</table>`,
    plainText: `New reply: Ticket #{{ticket_number}}

There is a new reply on your support ticket.
{{author}} wrote: {{preview}}

View Reply: {{panel_url}}/support/tickets/{{ticket_id}}`
  },
  {
    name: 'ticket_closed',
    description: 'Notification when a support ticket is closed',
    category: 'transactional',
    subject: 'Ticket closed: #{{ticket_number}} - {{panel_name}}',
    htmlBody: `<h2 style="font-size:18px;font-weight:600;color:#6b7280;margin:0 0 8px 0">Ticket closed</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">Support ticket <strong>#{{ticket_number}}</strong> has been closed.</p>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0 0">If you need further assistance, please reply to reopen the ticket or create a new one.</p>`,
    plainText: `Ticket closed: #{{ticket_number}}

Support ticket has been closed.`
  },
  {
    name: 'test_email',
    description: 'Test email to verify SMTP configuration',
    category: 'system',
    subject: 'Test email from {{panel_name}}',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:#059669;margin:0 0 8px 0">SMTP test successful</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">This is a test email to confirm that your SMTP configuration is working correctly.</p>
<div style="margin:24px 0;padding:16px;background-color:#f3f4f6;border-radius:8px;font-size:13px;color:#374151">
  <p style="margin:0 0 4px 0"><strong>Configuration</strong></p>
  <p style="margin:0">Server: {{smtp_host}}:{{smtp_port}}<br/>Username: {{smtp_user}}<br/>Encryption: {{encryption}}<br/>Sent: {{time}}</p>
</div>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0 0">If you received this email, your SMTP settings are configured correctly.</p>`,
    plainText: `SMTP test successful

This is a test email from {{panel_name}}.
Server: {{smtp_host}}:{{smtp_port}}
Username: {{smtp_user}}
Sent: {{time}}

If you received this email, your SMTP settings are configured correctly.`
  },
  {
    name: 'notification_alert',
    description: 'System notification alert sent via email from the notification system',
    category: 'system',
    subject: '[{{category}}] {{title}} - {{panel_name}}',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:{{color}};margin:0 0 8px 0">{{title}}</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">{{message}}</p>
{{#action_url}}<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0"><tr><td align="center" style="background-color:#2563eb;border-radius:8px"><a href="{{action_url}}" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">View Details</a></td></tr></table>{{/action_url}}
<hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0" />
<p style="font-size:12px;color:#9ca3af;margin:0">This is an automated notification from {{panel_name}}. Manage preferences in your Profile settings.<br/>Event: {{category}} &middot; {{time}}</p>`,
    plainText: `{{title}}

{{message}}

This is an automated notification from {{panel_name}}.
Event: {{category}} - {{time}}

Manage preferences in your Profile settings.`
  },
  {
    name: 'announcement',
    description: 'System-wide announcement sent to all users or specific groups',
    category: 'system',
    subject: '{{announcement_title}} - {{panel_name}}',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:#1a1a1a;margin:0 0 8px 0">{{announcement_title}}</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">{{announcement_message}}</p>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0 0">{{announcement_footer}}</p>`,
    plainText: `{{announcement_title}}

{{announcement_message}}

{{announcement_footer}}`
  },
  {
    name: 'task_completed',
    description: 'Notification that a background task has completed',
    category: 'transactional',
    subject: 'Task completed: {{task_name}} - {{panel_name}}',
    htmlBody: `<h2 style="font-size:18px;font-weight:600;color:#059669;margin:0 0 8px 0">Task completed</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">Background task <strong>{{task_name}}</strong> has completed successfully.</p>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0 0">Completed: {{time}}<br/>Duration: {{duration}}</p>`,
    plainText: `Task completed: {{task_name}}

Background task has completed successfully.
Completed: {{time}}
Duration: {{duration}}`
  },
  {
    name: 'task_failed',
    description: 'Notification that a background task has failed',
    category: 'transactional',
    subject: 'Task failed: {{task_name}} - {{panel_name}}',
    htmlBody: `<h2 style="font-size:18px;font-weight:600;color:#dc2626;margin:0 0 8px 0">Task failed</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">Background task <strong>{{task_name}}</strong> has failed.</p>
<div style="margin:24px 0;padding:16px;background-color:#fee2e2;border-radius:8px;font-size:13px;color:#991b1b">
  <p style="margin:0">Error: {{error}}</p>
</div>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0 0">The system will retry automatically. Check the task logs for details.</p>`,
    plainText: `Task failed: {{task_name}}

Background task has failed.
Error: {{error}}
The system will retry automatically.`
  },
  {
    name: 'security_report',
    description: 'Periodic security summary report',
    category: 'system',
    subject: 'Security report - {{panel_name}}',
    htmlBody: `<h2 style="font-size:20px;font-weight:600;color:#1a1a1a;margin:0 0 8px 0">Security report</h2>
<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">Your periodic security summary for {{panel_name}}.</p>
<div style="margin:24px 0;padding:16px;background-color:#f3f4f6;border-radius:8px;font-size:13px;color:#374151">
  <p style="margin:0 0 4px 0"><strong>Report Period: {{period_start}} - {{period_end}}</strong></p>
  <p style="margin:0">Logins: {{login_count}}<br/>Failed attempts: {{failed_login_count}}<br/>Password changes: {{password_changes}}<br/>API keys created: {{api_keys_created}}<br/>API keys revoked: {{api_keys_revoked}}<br/>Active sessions: {{active_sessions}}</p>
</div>
<p style="font-size:12px;color:#9ca3af;margin:16px 0 0 0">Review your account activity regularly to ensure no unauthorized access.</p>`,
    plainText: `Security report - {{panel_name}}

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
