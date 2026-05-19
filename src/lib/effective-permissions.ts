import { prisma } from "@/lib/prisma";

export type EffectivePermissions = {
  roleId: string;
  roleKey: string;
  isFullAccess: boolean;
  allowedModuleKeys: string[];
  allowedPagePathPatterns: string[];
  allowedApiReadPatterns: { pathPattern: string; method: string | null }[];
  allowedApiWritePatterns: { pathPattern: string; method: string | null }[];
};

/** 與 /api/role-permissions/effective 相同邏輯，供 server layout / route 共用。 */
export async function getEffectivePermissionsForRole(
  roleId: string,
  roleKey: string
): Promise<EffectivePermissions> {
  if (roleKey === "ADMIN") {
    return {
      roleId,
      roleKey,
      isFullAccess: true,
      allowedModuleKeys: [],
      allowedPagePathPatterns: [],
      allowedApiReadPatterns: [],
      allowedApiWritePatterns: [],
    };
  }

  const rolePerms = await prisma.rolePermission.findMany({
    where: { roleId },
    include: {
      module: {
        select: {
          key: true,
          patterns: {
            select: { kind: true, pathPattern: true, method: true },
          },
        },
      },
    },
  });

  const allowedModuleKeys = new Set<string>();
  const allowedPagePathPatterns = new Set<string>();
  const allowedApiReadMap = new Map<
    string,
    { pathPattern: string; method: string | null }
  >();
  const allowedApiWriteMap = new Map<
    string,
    { pathPattern: string; method: string | null }
  >();

  for (const rp of rolePerms) {
    const canReadEffective = rp.canRead || rp.canWrite;
    const canWriteEffective = rp.canWrite;

    if (canReadEffective) allowedModuleKeys.add(rp.module.key);

    for (const pattern of rp.module.patterns) {
      if (pattern.kind === "PAGE") {
        if (canReadEffective) allowedPagePathPatterns.add(pattern.pathPattern);
        continue;
      }

      const methodNormalized =
        pattern.method && pattern.method.length > 0 ? pattern.method : null;
      const key = `${pattern.pathPattern}::${methodNormalized ?? ""}`;

      if (canReadEffective) {
        allowedApiReadMap.set(key, {
          pathPattern: pattern.pathPattern,
          method: methodNormalized,
        });
      }
      if (canWriteEffective) {
        allowedApiWriteMap.set(key, {
          pathPattern: pattern.pathPattern,
          method: methodNormalized,
        });
      }
    }
  }

  return {
    roleId,
    roleKey,
    isFullAccess: false,
    allowedModuleKeys: Array.from(allowedModuleKeys),
    allowedPagePathPatterns: Array.from(allowedPagePathPatterns),
    allowedApiReadPatterns: Array.from(allowedApiReadMap.values()),
    allowedApiWritePatterns: Array.from(allowedApiWriteMap.values()),
  };
}
