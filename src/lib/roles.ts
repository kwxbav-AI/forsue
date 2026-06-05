export const ROLE_KEYS = {
  ADMIN: "ADMIN",
  SUPERVISOR: "SUPERVISOR",
  STORE_STAFF: "STORE_STAFF",
  LOGISTICS: "LOGISTICS",
  PURCHASE: "PURCHASE",
} as const;

export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];

/** 各角色可存取的功能模組 */
export const ROLE_MODULES: Record<RoleKey, string[]> = {
  ADMIN: ["*"],
  SUPERVISOR: [
    "operations-dashboard",
    "operations-analysis",
    "operations-workhours",
    "operations-heatmap",
    "store-ops-notify",
    "store-ops-bulletin-read",
    "store-ops-journal-read",
    "store-ops-supply-approve",
  ],
  STORE_STAFF: [
    "store-ops-notify",
    "store-ops-bulletin-read",
    "store-ops-task",
    "store-ops-journal-write",
    "store-ops-repair",
    "store-ops-supply-request",
    "store-ops-wishpool",
  ],
  LOGISTICS: ["store-ops-notify", "store-ops-supply-ship"],
  PURCHASE: ["store-ops-notify", "store-ops-wishpool-reply"],
};

export function isRoleKey(value: string | null | undefined): value is RoleKey {
  if (!value) return false;
  return Object.values(ROLE_KEYS).includes(value as RoleKey);
}
