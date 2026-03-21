import 'dotenv/config';
import { prisma } from './lib/prisma';
import { hashPassword } from './middleware/auth';
import { createPlatformInvitation } from './services/invitationService';
import { UserRole, UserStatus, AuthProvider } from '@prisma/client';

async function seed() {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@dataserver.app';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin@123!';
  const adminName = process.env.ADMIN_DISPLAY_NAME ?? 'Platform Admin';

  // Check if admin already exists
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    console.log(`Admin user already exists: ${adminEmail}`);
  } else {
    const passwordHash = await hashPassword(adminPassword);
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        displayName: adminName,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        authProvider: AuthProvider.LOCAL,
        storageQuotaBytes: BigInt(107374182400), // 100 GB for admin
      },
    });

    console.log('\n✅ Admin user created:');
    console.log(`   Email:    ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`   ID:       ${admin.id}`);

    // Create initial platform invitation code
    const invitation = await createPlatformInvitation({
      creatorId: admin.id,
      maxUses: 10,
      note: 'Initial platform invitation code created during setup',
    });

    console.log('\n🎟️  Initial platform invitation code:');
    console.log(`   Code: ${invitation.code}`);
    console.log(`   Max uses: ${invitation.maxUses}`);
    console.log('\n⚠️  Save this code! Share it with your first users.');
  }

  // Create default storage policy
  const existingPolicy = await prisma.storagePolicy.findFirst();
  if (!existingPolicy) {
    await prisma.storagePolicy.create({ data: {} });
    console.log('\n📋 Default storage policy created.');
  }

  console.log('\n✨ Seed complete!\n');
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
