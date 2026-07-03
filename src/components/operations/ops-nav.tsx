import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Store,
  Target,
  Clock,
  BarChart3,
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
};

export const OPS_NAV_ITEMS_BY_ROLE: Record<RoleKey, OpsNavItem[]> = {
  ADMIN: [
    { href: "/operations/dashboard", label: "營運總覽", icon: LayoutDashboard, permissionKey: "operations-dashboard" },
    { href: "/operations/analysis", label: "績效分析", icon: BarChart3, permissionKey: "operations-dashboard" },
    { href: "/operations/north", label: "北區總覽", icon: LayoutDashboard, permissionKey: "operations-north-dashboard" },
    { href: "/operations/north/analysis", label: "北區績效分析", icon: BarChart3, permissionKey: "operations-north-dashboard" },
    { href: "/operations/work-hours", label: "人員工時", icon: Clock, permissionKey: "operations-dashboard" },
    { href: "/operations/supervision/support-calendar", label: "人力支援管理", icon: HandHelping, permissionKey: "operations-dashboard" },
    { href: "/operations/stores", label: "門市管理", icon: Store, permissionKey: "operations-stores" },
    { href: "/operations/store-targets", label: "門市目標", icon: Target, permissionKey: "operations-store-targets" },
    { href: "/operations/permissions", label: "權限設定", icon: Shield, permissionKey: "operations-admin" },
  ],
  SUPERVISOR: [
    { href: "/operations/dashboard", label: "營運總覽", icon: LayoutDashboard, permissionKey: "operations-dashboard" },
    { href: "/operations/analysis", label: "績效分析", icon: BarChart3, permissionKey: "operations-dashboard" },
    { href: "/operations/work-hours", label: "人員工時", icon: Clock, permissionKey: "operations-dashboard" },
    { href: "/operations/supervision/support-calendar", label: "人力支援管理", icon: HandHelping, permissionKey: "operations-dashboard" },
  ],
  STORE_STAFF: [],
};

/** 舊版角色或未對應角色時的後備導覽 */
export const OPS_NAV_ITEMS_LEGACY: OpsNavItem[] = [
  { href: "/operations/dashboard", label: "營運總覽", icon: LayoutDashboard, permissionKey: "operations-dashboard" },
  { href: "/operations/analysis", label: "績效分析", icon: BarChart3, permissionKey: "operations-dashboard" },
  { href: "/operations/north", label: "北區總覽", icon: LayoutDashboard, permissionKey: "operations-north-dashboard" },
  { href: "/operations/north/analysis", label: "北區績效分析", icon: BarChart3, permissionKey: "operations-north-dashboard" },
  { href: "/operations/stores", label: "門市管理", icon: Store, permissionKey: "operations-stores" },
  { href: "/operations/store-targets", label: "門市目標", icon: Target, permissionKey: "operations-store-targets" },
  { href: "/operations/work-hours", label: "人員工時", icon: Clock, permissionKey: "operations-dashboard" },
  { href: "/operations/supervision/support-calendar", label: "人力支援管理", icon: HandHelping, permissionKey: "operations-dashboard" },
];

export function getOpsNavForRole(roleKey: string): OpsNavItem[] {
  if (isRoleKey(roleKey)) {
    return OPS_NAV_ITEMS_BY_ROLE[roleKey];
  }
  return OPS_NAV_ITEMS_LEGACY;
}
