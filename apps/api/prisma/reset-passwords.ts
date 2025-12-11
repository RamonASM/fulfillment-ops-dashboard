/**
 * Password Reset Script
 *
 * Run this script to reset all user passwords to known values.
 * Usage: npx tsx prisma/reset-passwords.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function resetPasswords() {
  console.log('='.repeat(60));
  console.log('PASSWORD RESET SCRIPT');
  console.log('='.repeat(60));

  // Define passwords
  const adminPassword = 'Admin2024!';
  const portalPassword = 'Portal2024!';

  // Hash passwords
  const adminHash = await bcrypt.hash(adminPassword, 12);
  const portalHash = await bcrypt.hash(portalPassword, 12);

  // Reset all admin dashboard users
  console.log('\n🔐 Resetting Admin Dashboard Users...');
  const adminUsers = await prisma.user.findMany();

  for (const user of adminUsers) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: adminHash },
    });
    console.log(`  ✓ ${user.email} -> ${adminPassword}`);
  }

  // Reset all portal users
  console.log('\n🔐 Resetting Portal Users...');
  const portalUsers = await prisma.portalUser.findMany({
    include: { client: true },
  });

  for (const user of portalUsers) {
    await prisma.portalUser.update({
      where: { id: user.id },
      data: { passwordHash: portalHash },
    });
    console.log(`  ✓ ${user.email} (${user.client?.name || 'Unknown'}) -> ${portalPassword}`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ PASSWORD RESET COMPLETE');
  console.log('='.repeat(60));

  console.log('\n📋 Admin Dashboard Logins:');
  console.log('─'.repeat(40));
  console.log(`URL:      https://admin.yourtechassist.us`);
  console.log(`Password: ${adminPassword}`);
  console.log('─'.repeat(40));
  for (const user of adminUsers) {
    console.log(`  • ${user.email} (${user.role})`);
  }

  console.log('\n📋 Client Portal Logins:');
  console.log('─'.repeat(40));
  console.log(`URL:      https://portal.yourtechassist.us`);
  console.log(`Password: ${portalPassword}`);
  console.log('─'.repeat(40));
  for (const user of portalUsers) {
    console.log(`  • ${user.email} (${user.client?.name || 'Unknown'})`);
  }

  console.log('\n');
}

resetPasswords()
  .catch((e) => {
    console.error('Error resetting passwords:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
