import { prisma } from "@/lib/prisma";
import { isRoleKey, ROLE_KEYS, type RoleKey } from "@/lib/roles";

export type AuthContext = {
  userId: string;
  username: string;
  roleKey: RoleKey;
  /** 門市人員：一間；督導：負責門市；ADMIN：null（全部） */
  allowedStoreIds: string[] | null;
};

export async function getAuthContext(userId: string): Promise<AuthContext> {
  const user = await prisma.appUser.findUnique({
    where: { id: userId },
    include: {
      role: true,
      supervisorStores: { select: { storeId: true } },
    },
  });
  if (!user) throw new Error("User not found");

  const roleKey: RoleKey =
    user.role?.key && isRoleKey(user.role.key) ? user.role.key : ROLE_KEYS.STORE_STAFF;

  let allowedStoreIds: string[] | null = null;

  if (roleKey === ROLE_KEYS.STORE_STAFF) {
    allowedStoreIds = user.retailStoreId ? [user.retailStoreId] : [];
  } else if (roleKey === ROLE_KEYS.SUPERVISOR) {
    allowedStoreIds = user.supervisorStores.map((s) => s.storeId);
  }

  return {
    userId: user.id,
    username: user.username,
    roleKey,
    allowedStoreIds,
  };
}
