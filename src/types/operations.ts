/** 營運分析／Dashboard 門市選項（績效 Store.id） */
export type OpsStoreOption = {
  id: string;
  storeName: string;
  region: string;
  catalogKey?: string;
};

export type OpsDashboardMeta = {
  regions: string[];
  stores: OpsStoreOption[];
};
