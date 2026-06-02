import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Store,
  Target,
  Clock,
  Users,
  DollarSign,
  BarChart3,
  LineChart,
} from "lucide-react";

export type OpsNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** 對應 permission module key 或 uploads */
  permissionKey: string;
  badge?: string;
};

export const OPS_NAV_ITEMS: OpsNavItem[] = [
  {
    href: "/operations/dashboard",
    label: "營運總覽",
    icon: LayoutDashboard,
    permissionKey: "operations-dashboard",
  },
  {
    href: "/operations/analysis",
    label: "門市績效分析",
    icon: BarChart3,
    permissionKey: "operations-dashboard",
  },
  {
    href: "/operations/performance",
    label: "業績分析",
    icon: LineChart,
    permissionKey: "operations-dashboard",
  },
  {
    href: "/operations/stores",
    label: "門市管理",
    icon: Store,
    permissionKey: "operations-stores",
  },
  {
    href: "/operations/store-targets",
    label: "門市目標",
    icon: Target,
    permissionKey: "operations-store-targets",
  },
  {
    href: "/operations/work-hours",
    label: "人員工時",
    icon: Clock,
    permissionKey: "operations-dashboard",
  },
  {
    href: "/operations/supervision",
    label: "督導管理",
    icon: Users,
    permissionKey: "operations-dashboard",
    badge: "C",
  },
  {
    href: "/operations/compensation",
    label: "獎金規則",
    icon: DollarSign,
    permissionKey: "operations-dashboard",
    badge: "C",
  },
];
