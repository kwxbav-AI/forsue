import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Store,
  Target,
  Clock,
  Users,
  BarChart3,
  Bell,
  Megaphone,
  CheckSquare,
  FileText,
  Wrench,
  Package,
  Heart,
  Map,
  Shield,
  HandHelping,
} from "lucide-react";
import { isRoleKey, type RoleKey } from "@/lib/roles";

export type OpsNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  permissionKey: string;
  badge?: string;
  /** 店務管理區塊（琥珀色系側欄提示） */
  storeOps?: boolean;
};

export const OPS_NAV_ITEMS_BY_ROLE: Record<RoleKey, OpsNavItem[]> = {
  ADMIN: [
    { href: "/operations/dashboard", label: "營運總覽", icon: LayoutDashboard, permissionKey: "operations-dashboard" },
    { href: "/operations/analysis", label: "績效分析", icon: BarChart3, permissionKey: "operations-dashboard" },
    { href: "/operations/work-hours", label: "人員工時", icon: Clock, permissionKey: "operations-dashboard" },
    {
      href: "/operations/supervision/support-calendar",
      label: "人力支援管理",
      icon: HandHelping,
      permissionKey: "operations-dashboard",
      storeOps: true,
    },
    { href: "/operations/store-ops/notify", label: "通知中心", icon: Bell, permissionKey: "store-ops-notify", badge: "dynamic", storeOps: true },
    { href: "/operations/store-ops/bulletin", label: "公佈欄", icon: Megaphone, permissionKey: "store-ops-notify", storeOps: true },
    { href: "/operations/store-ops/tasks", label: "任務", icon: CheckSquare, permissionKey: "store-ops-task", storeOps: true },
    { href: "/operations/store-ops/journal", label: "工作日誌", icon: FileText, permissionKey: "store-ops-journal-write", badge: "dynamic", storeOps: true },
    { href: "/operations/store-ops/repairs", label: "報修", icon: Wrench, permissionKey: "store-ops-repair", badge: "dynamic", storeOps: true },
    { href: "/operations/store-ops/supply", label: "物資申請", icon: Package, permissionKey: "store-ops-supply-request", storeOps: true },
    { href: "/operations/store-ops/wishpool", label: "商品許願池", icon: Heart, permissionKey: "store-ops-wishpool", storeOps: true },
    { href: "/operations/store-ops/heatmap", label: "客流熱力圖", icon: Map, permissionKey: "operations-heatmap" },
    { href: "/operations/stores", label: "門市管理", icon: Store, permissionKey: "operations-stores" },
    { href: "/operations/store-targets", label: "門市目標", icon: Target, permissionKey: "operations-store-targets" },
    { href: "/operations/permissions", label: "權限設定", icon: Shield, permissionKey: "operations-admin" },
  ],
  SUPERVISOR: [
    { href: "/operations/dashboard", label: "營運總覽", icon: LayoutDashboard, permissionKey: "operations-dashboard" },
    { href: "/operations/analysis", label: "績效分析", icon: BarChart3, permissionKey: "operations-dashboard" },
    { href: "/operations/work-hours", label: "人員工時", icon: Clock, permissionKey: "operations-dashboard" },
    {
      href: "/operations/supervision/support-calendar",
      label: "人力支援管理",
      icon: HandHelping,
      permissionKey: "operations-dashboard",
      storeOps: true,
    },
    { href: "/operations/store-ops/notify", label: "通知中心", icon: Bell, permissionKey: "store-ops-notify", badge: "dynamic", storeOps: true },
    { href: "/operations/store-ops/bulletin", label: "公佈欄", icon: Megaphone, permissionKey: "store-ops-notify", storeOps: true },
    { href: "/operations/store-ops/journal", label: "工作日誌", icon: FileText, permissionKey: "store-ops-journal-read", storeOps: true },
    { href: "/operations/store-ops/supply", label: "物資申請", icon: Package, permissionKey: "store-ops-supply-approve", badge: "dynamic", storeOps: true },
    { href: "/operations/store-ops/heatmap", label: "客流熱力圖", icon: Map, permissionKey: "operations-heatmap" },
  ],
  STORE_STAFF: [
    { href: "/operations/store-ops/notify", label: "通知中心", icon: Bell, permissionKey: "store-ops-notify", storeOps: true },
    { href: "/operations/store-ops/bulletin", label: "公佈欄", icon: Megaphone, permissionKey: "store-ops-bulletin-read", storeOps: true },
    { href: "/operations/store-ops/tasks", label: "任務", icon: CheckSquare, permissionKey: "store-ops-task", storeOps: true },
    { href: "/operations/store-ops/journal", label: "工作日誌", icon: FileText, permissionKey: "store-ops-journal-write", storeOps: true },
    { href: "/operations/store-ops/repairs", label: "報修", icon: Wrench, permissionKey: "store-ops-repair", storeOps: true },
    { href: "/operations/store-ops/supply", label: "物資申請", icon: Package, permissionKey: "store-ops-supply-request", storeOps: true },
    { href: "/operations/store-ops/wishpool", label: "商品許願池", icon: Heart, permissionKey: "store-ops-wishpool", storeOps: true },
  ],
  LOGISTICS: [
    { href: "/operations/store-ops/notify", label: "通知中心", icon: Bell, permissionKey: "store-ops-notify", badge: "dynamic", storeOps: true },
    { href: "/operations/store-ops/supply", label: "物資申請", icon: Package, permissionKey: "store-ops-supply-ship", storeOps: true },
  ],
  PURCHASE: [
    { href: "/operations/store-ops/notify", label: "通知中心", icon: Bell, permissionKey: "store-ops-notify", storeOps: true },
    { href: "/operations/store-ops/wishpool", label: "商品許願池", icon: Heart, permissionKey: "store-ops-wishpool-reply", storeOps: true },
  ],
};

/** 舊版角色或未對應角色時的後備導覽 */
export const OPS_NAV_ITEMS_LEGACY: OpsNavItem[] = [
  { href: "/operations/dashboard", label: "營運總覽", icon: LayoutDashboard, permissionKey: "operations-dashboard" },
  { href: "/operations/analysis", label: "績效分析", icon: BarChart3, permissionKey: "operations-dashboard" },
  { href: "/operations/stores", label: "門市管理", icon: Store, permissionKey: "operations-stores" },
  { href: "/operations/store-targets", label: "門市目標", icon: Target, permissionKey: "operations-store-targets" },
  { href: "/operations/work-hours", label: "人員工時", icon: Clock, permissionKey: "operations-dashboard" },
  {
    href: "/operations/supervision/support-calendar",
    label: "人力支援管理",
    icon: HandHelping,
    permissionKey: "operations-dashboard",
    storeOps: true,
  },
];

export function getOpsNavForRole(roleKey: string): OpsNavItem[] {
  if (isRoleKey(roleKey)) {
    return OPS_NAV_ITEMS_BY_ROLE[roleKey];
  }
  return OPS_NAV_ITEMS_LEGACY;
}
