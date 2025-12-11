import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// =============================================================================
// THUMBPRINT CLIENT SETUP
// Creates Thumbprint client and portal users
// Run with: npx tsx prisma/seed-thumbprint.ts
// =============================================================================

async function main() {
  console.log('🌱 Setting up Thumbprint client...\n');

  // Generate password hash
  const defaultPassword = 'Thumbprint2024!';
  const passwordHash = await bcrypt.hash(defaultPassword, 12);

  // =============================================================================
  // CREATE OR FIND CLIENT
  // =============================================================================
  console.log('🏢 Creating Thumbprint client...');

  let client = await prisma.client.findUnique({
    where: { code: 'THUMBPRINT' },
  });

  if (!client) {
    client = await prisma.client.create({
      data: {
        name: 'Thumbprint',
        code: 'THUMBPRINT',
        settings: {
          reorderLeadDays: 14,
          safetyStockWeeks: 2,
          serviceLevelTarget: 0.95,
          showOrphanProducts: false,
        },
      },
    });
    console.log(`  ✓ Created client: ${client.name} (${client.code})`);
  } else {
    console.log(`  ✓ Client already exists: ${client.name} (${client.code})`);
  }

  // =============================================================================
  // CREATE PORTAL USER FOR IVONNE
  // =============================================================================
  console.log('\n👤 Creating portal user for Ivonne...');

  let ivonne = await prisma.portalUser.findUnique({
    where: { email: 'ivonne@thumbprint.com' },
  });

  if (!ivonne) {
    ivonne = await prisma.portalUser.create({
      data: {
        clientId: client.id,
        email: 'ivonne@thumbprint.com',
        passwordHash,
        name: 'Ivonne',
        role: 'admin', // Portal admin can manage team members
        isActive: true,
        notificationPreferences: {
          emailAlerts: true,
          lowStockAlerts: true,
          orderUpdates: true,
          weeklyDigest: true,
        },
      },
    });
    console.log(`  ✓ Created portal user: ${ivonne.email}`);
    console.log(`    Role: ${ivonne.role} (can add team members)`);
  } else {
    console.log(`  ✓ Portal user already exists: ${ivonne.email}`);
  }

  // =============================================================================
  // LINK ADMIN USER TO CLIENT (so they can see Thumbprint in dashboard)
  // =============================================================================
  console.log('\n🔗 Linking admin users to Thumbprint...');

  const adminUsers = await prisma.user.findMany({
    where: {
      role: { in: ['admin', 'account_manager'] },
    },
  });

  for (const user of adminUsers) {
    const existing = await prisma.userClient.findUnique({
      where: {
        userId_clientId: {
          userId: user.id,
          clientId: client.id,
        },
      },
    });

    if (!existing) {
      await prisma.userClient.create({
        data: {
          userId: user.id,
          clientId: client.id,
          role: 'manager',
        },
      });
      console.log(`  ✓ Linked ${user.email} to Thumbprint`);
    } else {
      console.log(`  ✓ ${user.email} already linked to Thumbprint`);
    }
  }

  // =============================================================================
  // CREATE CLIENT CONFIGURATION
  // =============================================================================
  console.log('\n⚙️ Setting up client configuration...');

  const existingConfig = await prisma.clientConfiguration.findUnique({
    where: { clientId: client.id },
  });

  if (!existingConfig) {
    await prisma.clientConfiguration.create({
      data: {
        clientId: client.id,
        locationMode: 'single',
        orderResponseSlaHours: 24,
        alertResponseSlaHours: 4,
        feedbackEnabled: true,
        commentsEnabled: true,
        reportsEnabled: true,
      },
    });
    console.log('  ✓ Created client configuration');
  } else {
    console.log('  ✓ Client configuration already exists');
  }

  // =============================================================================
  // SUMMARY
  // =============================================================================
  console.log('\n' + '='.repeat(60));
  console.log('✅ THUMBPRINT SETUP COMPLETE');
  console.log('='.repeat(60));
  console.log('\n📋 Login Credentials:');
  console.log('─'.repeat(40));
  console.log(`Portal URL:  https://portal.yourtechassist.us`);
  console.log(`Email:       ivonne@thumbprint.com`);
  console.log(`Password:    ${defaultPassword}`);
  console.log('─'.repeat(40));
  console.log('\n📝 Next Steps:');
  console.log('1. Ivonne can log in to the portal');
  console.log('2. Upload inventory data via Excel import');
  console.log('3. Team members can be added (ask admin)');
  console.log('\n');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
