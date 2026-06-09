import { storeNameMatchesCatalogKey } from "@/lib/operations-dashboard";

export type SupervisorZone = {
  key: string;
  label: string;
  employeeCode: string;
  supervisorName: string;
  storeNames: readonly string[];
};

/** 督導轄區門市（人力支援管理篩選用） */
export const SUPERVISOR_ZONES: readonly SupervisorZone[] = [
  {
    key: "xinci",
    label: "心慈督導區",
    employeeCode: "T2003025",
    supervisorName: "鄒心慈",
    storeNames: ["南竹", "五福", "大竹", "中埔", "中北", "內壢", "力行", "大有", "昆明", "東勇"],
  },
  {
    key: "jiashan",
    label: "嘉珊督導區",
    employeeCode: "Y1810010",
    supervisorName: "李嘉珊",
    storeNames: ["礁溪", "校舍", "宜蘭", "女中", "中正"],
  },
  {
    key: "huiping",
    label: "惠萍督導區",
    employeeCode: "Y1908015",
    supervisorName: "陳惠萍",
    storeNames: ["中正南", "義成", "北成", "五結", "馬賽"],
  },
] as const;

const ZONE_BY_KEY = new Map(SUPERVISOR_ZONES.map((z) => [z.key, z]));

export function getSupervisorZone(key: string): SupervisorZone | undefined {
  return ZONE_BY_KEY.get(key);
}

export function storeMatchesSupervisorZone(storeName: string, zoneKey: string): boolean {
  const zone = getSupervisorZone(zoneKey);
  if (!zone) return false;
  return zone.storeNames.some((name) => storeNameMatchesCatalogKey(storeName, name));
}
