import type { Prisma } from "@prisma/client";

function toSnapshot(
  store: { name: string; department: string | null; isActive: boolean; code: string | null },
  aliases: { code: string }[]
) {
  return {
    name: store.name,
    department: store.department,
    isActive: store.isActive,
    code: store.code,
    aliases: aliases.map((a) => a.code).filter(Boolean).sort((a, b) => a.localeCompare(b)),
  };
}

/** 門市改為停用並寫入異動紀錄（與 DELETE /api/stores/[id] 行為一致）。 */
export async function deactivateStoreWithLog(
  tx: Prisma.TransactionClient,
  storeId: string,
  changedByUsername: string | null
): Promise<void> {
  const before = await tx.store.findUnique({
    where: { id: storeId },
    include: { aliases: true },
  });
  if (!before) throw new Error("找不到門市");
  const beforeSnap = toSnapshot(before, (before as { aliases?: { code: string }[] }).aliases ?? []);

  await tx.store.update({
    where: { id: storeId },
    data: { isActive: false },
  });

  const after = await tx.store.findUnique({
    where: { id: storeId },
    include: { aliases: true },
  });
  if (after) {
    const afterSnap = toSnapshot(after, (after as { aliases?: { code: string }[] }).aliases ?? []);
    await tx.storeChangeLog.create({
      data: {
        storeId,
        action: "DEACTIVATE",
        changedBy: changedByUsername,
        before: beforeSnap,
        after: afterSnap,
      },
    });
  }
}
