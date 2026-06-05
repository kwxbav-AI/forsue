/** 與 src/lib/roles.ts ROLE_MODULES 對齊的預設權限（seed / sync-permissions 共用） */

const ALL_ROLE_SPECS = [
  { key: "ADMIN", name: "管理員" },
  { key: "EDITOR", name: "編輯者" },
  { key: "VIEWER", name: "檢視者" },
  { key: "STORE_STAFF", name: "門市人員" },
  { key: "SUPERVISOR", name: "督導" },
  { key: "LOGISTICS", name: "總務" },
  { key: "PURCHASE", name: "採購" },
];

const DELETE_APPROVE_KEYS = new Set([
  "delete-approve-content-entries",
  "delete-approve-workhour-adjustments",
  "delete-approve-stores",
  "delete-approve-store-hour-deductions",
  "delete-approve-dispatches",
  "delete-approve-revenue-records",
]);

const STORE_STAFF_WRITE_KEYS = new Set([
  "workhour-related",
  "dispatches",
  "store-hour-deductions",
  "content-entries",
  "store-ops-task",
  "store-ops-journal-write",
  "store-ops-repair",
  "store-ops-supply-request",
  "store-ops-wishpool",
]);

const STORE_STAFF_READ_KEYS = new Set(["store-ops-notify", "store-ops-bulletin-read"]);

const SUPERVISOR_READ_KEYS = new Set([
  "home",
  "forbidden",
  "operations-dashboard",
  "operations-heatmap",
  "store-ops-notify",
  "store-ops-bulletin-read",
  "store-ops-journal-read",
  "store-ops-supply-request",
  "store-ops-supply-approve",
]);

const LOGISTICS_READ_KEYS = new Set([
  "home",
  "forbidden",
  "store-ops-notify",
  "store-ops-supply-request",
  "store-ops-supply-approve",
  "store-ops-supply-ship",
]);

const PURCHASE_READ_KEYS = new Set([
  "home",
  "forbidden",
  "store-ops-notify",
  "store-ops-wishpool",
  "store-ops-wishpool-reply",
]);

/** RolePermission.legacyRole 仍為 UserRole enum；新店務角色過渡期對應 EDITOR */
function legacyRoleForKey(role) {
  if (role === "ADMIN" || role === "EDITOR" || role === "VIEWER" || role === "STORE_STAFF") {
    return role;
  }
  return "EDITOR";
}

function defaultPerm(role, moduleKey) {
  if (role === "ADMIN") {
    if (moduleKey === "content-entries-deduct") return { canRead: true, canWrite: false };
    return { canRead: true, canWrite: true };
  }

  if (role === "EDITOR") {
    if (DELETE_APPROVE_KEYS.has(moduleKey)) return { canRead: true, canWrite: false };
    if (
      moduleKey === "settings-users" ||
      moduleKey === "settings-role-permissions" ||
      moduleKey === "settings-attendance-location"
    ) {
      return { canRead: false, canWrite: false };
    }
    if (moduleKey === "content-entries-deduct") return { canRead: true, canWrite: false };
    return { canRead: true, canWrite: true };
  }

  if (role === "VIEWER") {
    if (
      moduleKey === "home" ||
      moduleKey === "forbidden" ||
      moduleKey.startsWith("reports") ||
      moduleKey.startsWith("performance-") ||
      moduleKey.startsWith("operations") ||
      moduleKey === "data"
    ) {
      return { canRead: true, canWrite: false };
    }
    if (moduleKey === "content-entries-deduct") return { canRead: false, canWrite: false };
    return { canRead: false, canWrite: false };
  }

  if (role === "STORE_STAFF") {
    if (STORE_STAFF_WRITE_KEYS.has(moduleKey)) return { canRead: true, canWrite: true };
    if (STORE_STAFF_READ_KEYS.has(moduleKey)) return { canRead: true, canWrite: false };
    if (moduleKey === "home" || moduleKey === "forbidden") return { canRead: true, canWrite: false };
    if (moduleKey === "content-entries-deduct") return { canRead: false, canWrite: false };
    return { canRead: false, canWrite: false };
  }

  if (role === "SUPERVISOR") {
    if (moduleKey === "store-ops-supply-approve") return { canRead: true, canWrite: true };
    if (SUPERVISOR_READ_KEYS.has(moduleKey)) return { canRead: true, canWrite: false };
    return { canRead: false, canWrite: false };
  }

  if (role === "LOGISTICS") {
    if (moduleKey === "store-ops-supply-ship") return { canRead: true, canWrite: true };
    if (LOGISTICS_READ_KEYS.has(moduleKey)) return { canRead: true, canWrite: false };
    return { canRead: false, canWrite: false };
  }

  if (role === "PURCHASE") {
    if (moduleKey === "store-ops-wishpool-reply") return { canRead: true, canWrite: true };
    if (PURCHASE_READ_KEYS.has(moduleKey)) return { canRead: true, canWrite: false };
    return { canRead: false, canWrite: false };
  }

  return { canRead: false, canWrite: false };
}

module.exports = { ALL_ROLE_SPECS, defaultPerm, legacyRoleForKey };
