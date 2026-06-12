/** 與 src/lib/roles.ts ROLE_MODULES 對齊的預設權限（seed / sync-permissions 共用） */

const ALL_ROLE_SPECS = [
  { key: "ADMIN", name: "管理員" },
  { key: "EDITOR", name: "編輯者" },
  { key: "VIEWER", name: "檢視者" },
  { key: "STORE_STAFF", name: "門市人員" },
  { key: "SUPERVISOR", name: "督導" },
];

/** 已下線角色（sync 時標記為停用） */
const RETIRED_ROLE_KEYS = ["LOGISTICS", "PURCHASE"];

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
  "workhour-related",
  "dispatches",
  "workhour-adjustments",
  "store-hour-deductions",
  "batch-workhour-adjustment",
  "content-entries",
  "reports",
  "reports-attendance",
  "reports-revenue",
  "reports-charts",
  "reports-store-target-card",
  "reports-revenue-forecast",
  "performance-daily",
  "performance-target-summary",
  "store-ops-notify",
  "store-ops-bulletin-read",
  "store-ops-journal-read",
  "store-ops-supply-request",
  "store-ops-supply-approve",
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
    if (moduleKey === "settings-users" || moduleKey === "settings-attendance-location") {
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

  return { canRead: false, canWrite: false };
}

module.exports = { ALL_ROLE_SPECS, RETIRED_ROLE_KEYS, defaultPerm, legacyRoleForKey };
