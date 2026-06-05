/**
 * 營運部 Dashboard 配色系統
 * 使用方式：import { OPS_COLORS } from "@/lib/ops-color-tokens"
 *
 * 設計原則：
 *   藍  → 業績 / 營收
 *   綠  → 工時 / 效率
 *   琥珀 → 達成率 / 目標
 *   紫  → 來客 / 客單
 *   語意色只用於達標判斷，不與主題色混用
 */

export const OPS_COLORS = {
  // ─────────────────────────────────────────
  // 主題色：業績 / 營收（Blue）
  // 用於：全公司營收、區間營業額、月業績目標、營收達成值、月度柱狀圖
  // ─────────────────────────────────────────
  revenue: {
    bg: "#E6F1FB",
    bgHover: "#B5D4F4",
    border: "#B5D4F4",
    iconBg: "#B5D4F4",
    icon: "#0C447C",
    label: "#185FA5",
    value: "#0C447C",
    chart: "#378ADD",
    chartMute: "#85B7EB",
  },

  // ─────────────────────────────────────────
  // 主題色：工時 / 效率（Teal）
  // 用於：總工時、工效比、人均產值、加班工時、工時趨勢折線
  // ─────────────────────────────────────────
  hours: {
    bg: "#E1F5EE",
    bgHover: "#9FE1CB",
    border: "#9FE1CB",
    iconBg: "#9FE1CB",
    icon: "#085041",
    label: "#0F6E56",
    value: "#085041",
    chart: "#1D9E75",
    chartMute: "#5DCAA5",
    chartDeep: "#0F6E56",
  },

  // ─────────────────────────────────────────
  // 主題色：達成率 / 目標（Amber）
  // 用於：區間達成率%、達成率折線、KPI 目標卡
  // ─────────────────────────────────────────
  achievement: {
    bg: "#FAEEDA",
    bgHover: "#FAC775",
    border: "#FAC775",
    iconBg: "#FAC775",
    icon: "#633806",
    label: "#854F0B",
    value: "#633806",
    chart: "#EF9F27",
    chartDeep: "#BA7517",
  },

  // ─────────────────────────────────────────
  // 主題色：來客 / 客單（Purple）
  // 用於：來客數、平均客單價、客數趨勢
  // ─────────────────────────────────────────
  customer: {
    bg: "#EEEDFE",
    bgHover: "#CECBF6",
    border: "#CECBF6",
    iconBg: "#CECBF6",
    icon: "#26215C",
    label: "#534AB7",
    value: "#26215C",
    chart: "#7F77DD",
    chartMute: "#AFA9EC",
  },

  // ─────────────────────────────────────────
  // 語意狀態色：達標判斷（僅用於門市達標分類）
  // ─────────────────────────────────────────
  status: {
    met: {
      bg: "#EAF3DE",
      border: "#C0DD97",
      dot: "#3B6D11",
      label: "#27500A",
      value: "#3B6D11",
    },
    unmet: {
      bg: "#FCEBEB",
      border: "#F7C1C1",
      dot: "#A32D2D",
      label: "#791F1F",
      value: "#A32D2D",
    },
    none: {
      bg: "#F1EFE8",
      border: "#D3D1C7",
      dot: "#5F5E5A",
      label: "#444441",
      value: "#5F5E5A",
    },
  },

  // ─────────────────────────────────────────
  // YoY 成長率（方向色，背景維持中性灰卡）
  // ─────────────────────────────────────────
  yoy: {
    positive: "#3B6D11",
    negative: "#A32D2D",
    neutral: "#5F5E5A",
  },

  // ─────────────────────────────────────────
  // 區域對標圖表（桃園 Blue / 宜蘭 Teal）
  // ─────────────────────────────────────────
  region: {
    taoyuan: {
      target: "#B5D4F4",
      actual: "#185FA5",
      label: "#0C447C",
    },
    yilan: {
      target: "#9FE1CB",
      actual: "#0F6E56",
      label: "#085041",
    },
  },
} as const;

export type OpsThemeToken = {
  bg: string;
  border: string;
  iconBg: string;
  icon: string;
  label: string;
  value: string;
};

export type StoreStatus = "met" | "unmet" | "none";

export function getStatusColor(status: StoreStatus) {
  return OPS_COLORS.status[status];
}

export function achievementToStatus(rate: number | null): StoreStatus {
  if (rate == null || !Number.isFinite(rate)) return "none";
  return rate >= 100 ? "met" : "unmet";
}

export function getYoyColor(rate: number | null): string {
  if (rate == null || !Number.isFinite(rate)) return OPS_COLORS.yoy.neutral;
  if (rate > 0) return OPS_COLORS.yoy.positive;
  if (rate < 0) return OPS_COLORS.yoy.negative;
  return OPS_COLORS.yoy.neutral;
}

export const REGION_CHART_COLORS = {
  桃園區: OPS_COLORS.region.taoyuan,
  宜蘭區: OPS_COLORS.region.yilan,
} as const;

/** 客流熱力圖 6 級（Teal 色系，淺→深） */
export const HEATMAP_SCALE = [
  OPS_COLORS.hours.bg,
  OPS_COLORS.hours.border,
  OPS_COLORS.hours.chartMute,
  OPS_COLORS.hours.chart,
  OPS_COLORS.hours.chartDeep,
  OPS_COLORS.hours.value,
] as const;
