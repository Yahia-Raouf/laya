import { prisma } from "./db.js";

// Record an admin action (key.create, key.update, key.delete, auth.login, ...).
export async function audit(
  actor: string,
  action: string,
  targetKeyId?: string | null,
  detail?: unknown,
): Promise<void> {
  await prisma.auditEvent
    .create({
      data: {
        actor,
        action,
        targetKeyId: targetKeyId ?? null,
        detail: detail === undefined ? undefined : (detail as object),
      },
    })
    .catch((err) => console.error("audit write failed:", err));
}
