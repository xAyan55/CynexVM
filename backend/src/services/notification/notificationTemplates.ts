export interface NotificationTemplateDef {
  title: string;
  message: string;
  category: string;
  priority: 'Info' | 'Success' | 'Warning' | 'Error' | 'Critical';
  icon: string;
  color: string;
  actionUrl?: string;
}

export const templates: Record<string, NotificationTemplateDef> = {
  'instance.created': {
    title: 'Container Created',
    message: 'Instance {{instance}} has been successfully created.',
    category: 'Instance',
    priority: 'Success',
    icon: 'Cpu',
    color: '#10B981',
    actionUrl: '/instances/{{instanceId}}'
  },
  'instance.deleted': {
    title: 'Container Destroyed',
    message: 'Instance {{instance}} has been permanently deleted.',
    category: 'Instance',
    priority: 'Warning',
    icon: 'Trash2',
    color: '#EF4444',
    actionUrl: '/'
  },
  'instance.started': {
    title: 'Container Started',
    message: 'Instance {{instance}} has successfully started.',
    category: 'Instance',
    priority: 'Success',
    icon: 'Play',
    color: '#10B981',
    actionUrl: '/instances/{{instanceId}}'
  },
  'instance.stopped': {
    title: 'Container Stopped',
    message: 'Instance {{instance}} has stopped.',
    category: 'Instance',
    priority: 'Warning',
    icon: 'Square',
    color: '#F59E0B',
    actionUrl: '/instances/{{instanceId}}'
  },
  'instance.rebooted': {
    title: 'Container Restarted',
    message: 'Instance {{instance}} has successfully rebooted.',
    category: 'Instance',
    priority: 'Success',
    icon: 'RotateCw',
    color: '#3B82F6',
    actionUrl: '/instances/{{instanceId}}'
  },
  'instance.killed': {
    title: 'Container Force Killed',
    message: 'Instance {{instance}} was forcefully terminated.',
    category: 'Instance',
    priority: 'Critical',
    icon: 'Skull',
    color: '#EF4444',
    actionUrl: '/instances/{{instanceId}}'
  },
  'instance.suspended': {
    title: 'Container Suspended',
    message: 'Instance {{instance}} has been suspended by system controls.',
    category: 'Instance',
    priority: 'Warning',
    icon: 'Pause',
    color: '#F59E0B',
    actionUrl: '/instances/{{instanceId}}'
  },
  'deployment.started': {
    title: 'Deployment Started',
    message: 'OS Template deploy started for {{instance}} on node {{node}}.',
    category: 'Deployment',
    priority: 'Info',
    icon: 'Layers',
    color: '#3B82F6',
    actionUrl: '/admin/tasks'
  },
  'deployment.completed': {
    title: 'Deployment Completed',
    message: 'OS Template deploy for {{instance}} completed successfully.',
    category: 'Deployment',
    priority: 'Success',
    icon: 'CheckCircle',
    color: '#10B981',
    actionUrl: '/instances/{{instanceId}}'
  },
  'deployment.failed': {
    title: 'Deployment Failed',
    message: 'OS Template deploy for {{instance}} failed: {{error}}.',
    category: 'Deployment',
    priority: 'Error',
    icon: 'AlertTriangle',
    color: '#EF4444',
    actionUrl: '/admin/tasks'
  },
  'backup.started': {
    title: 'Backup Initiated',
    message: 'Backup process started for instance {{instance}}.',
    category: 'Backup',
    priority: 'Info',
    icon: 'Shield',
    color: '#3B82F6',
    actionUrl: '/instances/{{instanceId}}#backups'
  },
  'backup.completed': {
    title: 'Backup Completed',
    message: 'Backup for instance {{instance}} succeeded (Size: {{size}}).',
    category: 'Backup',
    priority: 'Success',
    icon: 'ShieldCheck',
    color: '#10B981',
    actionUrl: '/instances/{{instanceId}}#backups'
  },
  'backup.failed': {
    title: 'Backup Failed',
    message: 'Backup for instance {{instance}} failed: {{error}}.',
    category: 'Backup',
    priority: 'Error',
    icon: 'AlertOctagon',
    color: '#EF4444',
    actionUrl: '/instances/{{instanceId}}#backups'
  },
  'snapshot.created': {
    title: 'Snapshot Created',
    message: 'Snapshot checkpoint {{snapshot}} created for container {{instance}}.',
    category: 'Snapshot',
    priority: 'Success',
    icon: 'Camera',
    color: '#10B981',
    actionUrl: '/instances/{{instanceId}}'
  },
  'snapshot.restored': {
    title: 'Snapshot Restored',
    message: 'Container {{instance}} filesystem restored to snapshot {{snapshot}}.',
    category: 'Snapshot',
    priority: 'Warning',
    icon: 'RefreshCw',
    color: '#3B82F6',
    actionUrl: '/instances/{{instanceId}}'
  },
  'snapshot.deleted': {
    title: 'Snapshot Deleted',
    message: 'Snapshot checkpoint {{snapshot}} deleted from container {{instance}}.',
    category: 'Snapshot',
    priority: 'Info',
    icon: 'Trash',
    color: '#EF4444',
    actionUrl: '/instances/{{instanceId}}'
  },
  'image.download_finished': {
    title: 'OS Template Cached',
    message: 'OS template distribution {{image}} downloaded successfully.',
    category: 'Storage',
    priority: 'Success',
    icon: 'DownloadCloud',
    color: '#10B981',
    actionUrl: '/admin/templates'
  },
  'image.download_failed': {
    title: 'Template Download Failed',
    message: 'Failed to download OS template {{image}}: {{error}}.',
    category: 'Storage',
    priority: 'Error',
    icon: 'AlertTriangle',
    color: '#EF4444',
    actionUrl: '/admin/templates'
  },
  'node.online': {
    title: 'Host Node Online',
    message: 'Hypervisor host node {{node}} has connected successfully.',
    category: 'Node',
    priority: 'Success',
    icon: 'Server',
    color: '#10B981',
    actionUrl: '/admin/nodes'
  },
  'node.offline': {
    title: 'Host Node Offline',
    message: 'Hypervisor host node {{node}} is unreachable or offline!',
    category: 'Node',
    priority: 'Critical',
    icon: 'WifiOff',
    color: '#EF4444',
    actionUrl: '/admin/nodes'
  },
  'node.high_cpu': {
    title: 'High CPU Utilization',
    message: 'Host node {{node}} is exhibiting high CPU usage: {{cpu}}%.',
    category: 'Node',
    priority: 'Warning',
    icon: 'Activity',
    color: '#F59E0B',
    actionUrl: '/admin/nodes'
  },
  'node.high_ram': {
    title: 'High RAM Utilization',
    message: 'Host node {{node}} is exhibiting high Memory usage: {{memory}}%.',
    category: 'Node',
    priority: 'Warning',
    icon: 'Activity',
    color: '#F59E0B',
    actionUrl: '/admin/nodes'
  },
  'node.low_disk': {
    title: 'Low Disk Storage Space',
    message: 'Host node {{node}} storage pool is running out of disk space.',
    category: 'Node',
    priority: 'Critical',
    icon: 'HardDrive',
    color: '#EF4444',
    actionUrl: '/admin/nodes'
  },
  'node.maintenance': {
    title: 'Node Maintenance Mode',
    message: 'Host node {{node}} has been set to maintenance mode.',
    category: 'Node',
    priority: 'Info',
    icon: 'Wrench',
    color: '#3B82F6',
    actionUrl: '/admin/nodes'
  },
  'user.registered': {
    title: 'User Registered',
    message: 'A new user account {{user}} has been registered.',
    category: 'Account',
    priority: 'Info',
    icon: 'UserPlus',
    color: '#3B82F6',
    actionUrl: '/admin/users'
  },
  'user.login': {
    title: 'User Access Logged',
    message: 'Successful authentication for user {{user}} from {{ip}}.',
    category: 'Security',
    priority: 'Info',
    icon: 'Key',
    color: '#10B981',
    actionUrl: '/profile'
  },
  'user.login_failed': {
    title: 'Failed Access Challenge',
    message: 'Failed login attempt for account {{user}} from {{ip}}.',
    category: 'Security',
    priority: 'Warning',
    icon: 'AlertOctagon',
    color: '#EF4444',
    actionUrl: '/admin/audit-logs'
  },
  'user.password_changed': {
    title: 'Password Updated',
    message: 'Account password has been successfully updated.',
    category: 'Security',
    priority: 'Warning',
    icon: 'Lock',
    color: '#F59E0B',
    actionUrl: '/profile'
  },
  'user.email_changed': {
    title: 'Email Address Changed',
    message: 'Email address has been updated to {{email}}.',
    category: 'Account',
    priority: 'Warning',
    icon: 'Mail',
    color: '#F59E0B',
    actionUrl: '/profile'
  },
  'user.api_token_created': {
    title: 'API Token Created',
    message: 'New orchestration bearer token generated successfully.',
    category: 'Security',
    priority: 'Info',
    icon: 'KeyRound',
    color: '#3B82F6',
    actionUrl: '/profile'
  },
  'user.api_token_deleted': {
    title: 'API Token Revoked',
    message: 'Orchestration bearer token revoked successfully.',
    category: 'Security',
    priority: 'Info',
    icon: 'Key',
    color: '#EF4444',
    actionUrl: '/profile'
  },
  'system.announcement': {
    title: 'System Announcement',
    message: 'Announcement: {{message}}',
    category: 'System',
    priority: 'Info',
    icon: 'Megaphone',
    color: '#3B82F6',
    actionUrl: '/'
  },
  'system.maintenance': {
    title: 'Maintenance Notice',
    message: 'System Maintenance: {{message}}',
    category: 'System',
    priority: 'Warning',
    icon: 'Clock',
    color: '#F59E0B',
    actionUrl: '/'
  },
  'system.update_available': {
    title: 'Control Panel Update',
    message: 'A new control panel update is available: {{version}}.',
    category: 'System',
    priority: 'Info',
    icon: 'RefreshCw',
    color: '#3B82F6',
    actionUrl: '/admin/settings'
  },
  'task.completed': {
    title: 'Background Task Completed',
    message: 'Task "{{task}}" completed successfully.',
    category: 'Task',
    priority: 'Success',
    icon: 'CheckSquare',
    color: '#10B981',
    actionUrl: '/admin/tasks'
  },
  'task.failed': {
    title: 'Background Task Failed',
    message: 'Task "{{task}}" failed: {{error}}.',
    category: 'Task',
    priority: 'Error',
    icon: 'XSquare',
    color: '#EF4444',
    actionUrl: '/admin/tasks'
  }
};

export function renderTemplate(templateStr: string, vars: Record<string, any>): string {
  return templateStr.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return vars[key] !== undefined ? String(vars[key]) : `{{${key}}}`;
  });
}
