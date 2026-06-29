import { db } from './db';
import argon2 from 'argon2';

async function seed() {
  console.log('Starting seed operations...');

  // 1. Create Permission Groups
  const groupVirt = await db.permissionGroup.upsert({
    where: { name: 'Virtualization' },
    update: {},
    create: { name: 'Virtualization', description: 'Container lifecycle, console, and backups operations' }
  });

  const groupAdmin = await db.permissionGroup.upsert({
    where: { name: 'Infrastructure' },
    update: {},
    create: { name: 'Infrastructure', description: 'Hypervisor node management and settings' }
  });

  const groupUsers = await db.permissionGroup.upsert({
    where: { name: 'Identity' },
    update: {},
    create: { name: 'Identity', description: 'User management, permissions, and session tracking' }
  });

  // 2. Create Permissions
  const permissionsList = [
    { name: 'instance.read', description: 'View container status and lists', groupId: groupVirt.id },
    { name: 'instance.start', description: 'Start containers', groupId: groupVirt.id },
    { name: 'instance.stop', description: 'Stop and shutdown containers', groupId: groupVirt.id },
    { name: 'instance.reboot', description: 'Reboot containers', groupId: groupVirt.id },
    { name: 'instance.create', description: 'Deploy new containers', groupId: groupVirt.id },
    { name: 'instance.delete', description: 'Destroy containers', groupId: groupVirt.id },
    { name: 'instance.console', description: 'Access container console terminal', groupId: groupVirt.id },
    { name: 'instance.files', description: 'Manage container files', groupId: groupVirt.id },
    { name: 'instance.backups', description: 'Manage container backups & snapshots', groupId: groupVirt.id },
    { name: 'instance.network', description: 'Configure firewall and networking', groupId: groupVirt.id },
    { name: 'node.read', description: 'View node details and statistics', groupId: groupAdmin.id },
    { name: 'node.create', description: 'Add new hypervisor nodes', groupId: groupAdmin.id },
    { name: 'node.delete', description: 'Delete hypervisor nodes', groupId: groupAdmin.id },
    { name: 'node.write', description: 'Update nodes and toggles', groupId: groupAdmin.id },
    { name: 'user.read', description: 'List and view system accounts', groupId: groupUsers.id },
    { name: 'user.write', description: 'Modify users and edit roles', groupId: groupUsers.id },
    { name: 'settings.write', description: 'Change panel settings and branding configuration', groupId: groupAdmin.id },
  ];

  const dbPermissions = [];
  for (const perm of permissionsList) {
    const createdPerm = await db.permission.upsert({
      where: { name: perm.name },
      update: { description: perm.description, groupId: perm.groupId },
      create: perm
    });
    dbPermissions.push(createdPerm);
  }

  // 3. Create Admin Role
  const adminRole = await db.role.upsert({
    where: { name: 'Admin' },
    update: {},
    create: {
      name: 'Admin',
      description: 'Full system administrator with unrestricted control'
    }
  });

  // Link all permissions to Admin role
  for (const perm of dbPermissions) {
    await db.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: perm.id
        }
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: perm.id
      }
    });
  }

  // Create User Role
  const userRole = await db.role.upsert({
    where: { name: 'User' },
    update: {},
    create: {
      name: 'User',
      description: 'Standard client user with limited scope access'
    }
  });

  // Link basic permissions to User role
  const userPermissions = ['instance.read', 'instance.start', 'instance.stop', 'instance.reboot', 'instance.console', 'instance.files', 'instance.backups', 'instance.network'];
  for (const perm of dbPermissions) {
    if (userPermissions.includes(perm.name)) {
      await db.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: userRole.id,
            permissionId: perm.id
          }
        },
        update: {},
        create: {
          roleId: userRole.id,
          permissionId: perm.id
        }
      });
    }
  }

  // 4. Create default administrator
  const adminEmail = 'admin@gmail.com';
  const existingAdmin = await db.user.findUnique({
    where: { email: adminEmail }
  });

  if (!existingAdmin) {
    const defaultPassword = 'admin';
    const passwordHash = await argon2.hash(defaultPassword, {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4
    });

    const adminUser = await db.user.create({
      data: {
        username: 'admin',
        email: adminEmail,
        passwordHash,
        emailVerified: true
      }
    });

    // Link user to admin role
    await db.userRole.create({
      data: {
        userId: adminUser.id,
        roleId: adminRole.id
      }
    });

    console.log(`Default Administrator seeded:
    Username: admin
    Email: ${adminEmail}
    Password: ${defaultPassword}
    [WARNING: Change password immediately on login]`);
  } else {
    console.log('Administrator user already exists.');
  }

  // Seed default scopes
  const scopes = ['vps:read', 'vps:write', 'nodes:read', 'nodes:write', 'settings:read', 'settings:write'];
  for (const s of scopes) {
    await db.apiScope.upsert({
      where: { name: s },
      update: {},
      create: { name: s, description: `Scope permission for api endpoint access: ${s}` }
    });
  }

  // Seed default settings
  const defaultSettings = [
    { key: 'panel_name', value: 'CynexVM' },
    { key: 'logo_url', value: '/assets/logo.svg' },
    { key: 'primary_color', value: '#2563EB' },
    { key: 'secondary_color', value: '#1E3A8A' },
    { key: 'theme_mode', value: 'dark' },
    { key: 'maintenance_mode', value: 'false' },
    { key: 'welcome_message', value: 'Welcome to CynexVM Enterprise LXC Manager' }
  ];

  for (const setting of defaultSettings) {
    await db.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting
    });
  }

  console.log('Database seeding finished successfully.');
}

if (require.main === module) {
  seed()
    .catch((err) => {
      console.error('Error during database seed:', err);
      process.exit(1);
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
export { seed };
