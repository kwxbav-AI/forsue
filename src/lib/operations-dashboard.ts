/** Dashboard KPI「兩區」：桃園區 + 宜蘭區（不含台北區） */

export const DUAL_OPS_REGIONS = ["桃園區", "宜蘭區"] as const;



/** 營運篩選用門市清單（順序固定，名稱不含「店」與 DB Store.name 一致） */

export const OPS_REGION_CATALOG: ReadonlyArray<{

  region: string;

  storeNames: readonly string[];

}> = [

  {

    region: "宜蘭區",

    storeNames: [

      "礁溪",

      "校舍",

      "宜蘭",

      "女中",

      "中正",

      "中正南",

      "義成",

      "北成",

      "五結",

      "馬賽",

    ],

  },

  {

    region: "桃園區",

    storeNames: [

      "南竹",

      "五福",

      "大竹",

      "中埔",

      "中北",

      "內壢",

      "力行",

      "大有",

      "昆明",

      "東勇",

    ],

  },

  {

    region: "台北區",

    storeNames: ["萬隆", "虎林", "嘉興", "福德"],

  },

] as const;



export const OPS_FILTER_REGIONS = OPS_REGION_CATALOG.map((g) => g.region);



const STORE_TO_REGION = new Map<string, string>();

for (const { region, storeNames } of OPS_REGION_CATALOG) {

  for (const name of storeNames) {

    STORE_TO_REGION.set(name, region);

  }

}



export function normalizeStoreKey(name: string): string {
  return name.trim().replace(/店$/, "");
}

/** 兩個門市名稱是否為同一 catalog 門市（女中 = 女中店、南竹 = 南竹店） */
export function storeNamesEquivalent(a: string, b: string): boolean {
  const ka = normalizeStoreKey(a);
  const kb = normalizeStoreKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  return storeNameMatchesCatalogKey(a, kb) && storeNameMatchesCatalogKey(b, ka);
}

/** 門市名稱是否對應營運 catalog 簡稱（如「女中」「宜蘭區-女中店」） */
export function storeNameMatchesCatalogKey(
  storeName: string,
  catalogKey: string
): boolean {
  const ck = normalizeStoreKey(catalogKey);
  if (!ck) return false;

  const sn = normalizeStoreKey(storeName);
  if (sn === ck) return true;

  const segments = storeName
    .trim()
    .split(/[-－\s/]+/)
    .map((s) => normalizeStoreKey(s))
    .filter(Boolean);
  if (segments.some((seg) => seg === ck)) return true;

  if (sn.endsWith(ck)) return true;
  if (sn.length > ck.length && sn.endsWith(`${ck}店`)) return true;

  return false;
}



export function formatOpsStoreLabel(name: string): string {

  const key = normalizeStoreKey(name);

  return `${key}店`;

}



export function inferRetailRegion(

  name: string,

  department: string | null | undefined

): string | null {

  const key = normalizeStoreKey(name);

  const fromCatalog = STORE_TO_REGION.get(key);

  if (fromCatalog) return fromCatalog;



  const dept = department?.trim();

  if (dept) {

    const m = dept.match(/^(桃園區|宜蘭區|台北區)/);

    if (m) return m[1];

  }

  return null;

}



export function formatPct(n: number | null): string {

  if (n == null || Number.isNaN(n)) return "—";

  const sign = n > 0 ? "+" : "";

  return `${sign}${n.toFixed(1)}%`;

}


