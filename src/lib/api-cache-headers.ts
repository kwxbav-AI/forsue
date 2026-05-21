import { NextResponse } from "next/server";

/** 統計類 API：CDN 快取 1 小時，過期後 10 分鐘內可 stale 回傳 */
export const STATS_CACHE_CONTROL = "s-maxage=3600, stale-while-revalidate=600";

export function jsonWithStatsCache<T>(
  data: T,
  init?: ResponseInit
): NextResponse<T> {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", STATS_CACHE_CONTROL);
  return NextResponse.json(data, { ...init, headers });
}
