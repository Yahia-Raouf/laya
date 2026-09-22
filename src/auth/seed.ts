import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import { env } from "../env.js";

// Create the admin user from env on first boot. Does not overwrite an existing
// user, so a future password change in the portal would survive a restart.
export async function seedAdmin(): Promise<void> {
  const existing = await prisma.adminUser.findUnique({
    where: { username: env.ADMIN_USERNAME },
  });
  if (existing) return;
  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 10);
  await prisma.adminUser.create({
    data: { username: env.ADMIN_USERNAME, passwordHash },
  });
  console.log(`seeded admin user "${env.ADMIN_USERNAME}"`);
}
