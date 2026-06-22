import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  normalizeStoreKey,
  storeNameMatchesCatalogKey,
  storeNamesEquivalent,
} from "@/lib/operations-dashboard";

export const dynamic = "force-dynamic";

/**
 * 開發用：診斷 Performance Store → RetailStore 名稱比對
 * GET /api/dev/store-match-debug?storeName=北成
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const sp = request.nextUrl.searchParams;
  const queryName = sp.get("storeName")?.trim() ?? "";

  const perfStores = await prisma.store.findMany({
    where: { isActive: true, hideInReports: false },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const retailStores = await prisma.retailStore.findMany({
    where: { isActive: true },
    select: {
      id: true,
      storeName: true,
      dailyBusinessHours: true,
      weekdayBusinessHours: true,
      saturdayBusinessHours: true,
    },
    orderBy: { storeName: "asc" },
  });

  function toOptionalNumber(v: unknown): number | null {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  const retailByExactName = new Map(retailStores.map((r) => [r.storeName.trim(), r]));
  const retailByNormKey = new Map(retailStores.map((r) => [normalizeStoreKey(r.storeName), r]));

  // Check for key collisions in retailByNormKey
  const keyCollisions: Record<string, string[]> = {};
  for (const r of retailStores) {
    const key = normalizeStoreKey(r.storeName);
    keyCollisions[key] = keyCollisions[key] ?? [];
    keyCollisions[key].push(r.storeName);
  }
  const collisions = Object.entries(keyCollisions).filter(([, names]) => names.length > 1);

  const matchResults = perfStores
    .filter((s) => !queryName || s.name.includes(queryName) || storeNamesEquivalent(s.name, queryName))
    .map((s) => {
      const perfKey = normalizeStoreKey(s.name);
      const byExact = retailByExactName.get(s.name.trim());
      const byNorm = retailByNormKey.get(perfKey);
      const byFuzzy = !byExact && !byNorm
        ? retailStores.find(
            (r) =>
              storeNameMatchesCatalogKey(r.storeName, perfKey) ||
              storeNameMatchesCatalogKey(s.name, r.storeName) ||
              storeNamesEquivalent(r.storeName, s.name)
          )
        : undefined;

      const matched = byExact ?? byNorm ?? byFuzzy ?? null;
      const matchMethod = byExact ? "exact" : byNorm ? "normKey" : byFuzzy ? "fuzzy" : "none";

      return {
        perfStore: { id: s.id, name: s.name, normKey: perfKey },
        matchMethod,
        retail: matched
          ? {
              id: matched.id,
              storeName: matched.storeName,
              weekdayBusinessHours: toOptionalNumber(matched.weekdayBusinessHours),
              dailyBusinessHours: toOptionalNumber(matched.dailyBusinessHours),
              saturdayBusinessHours: toOptionalNumber(matched.saturdayBusinessHours),
              effectiveWeekdayHours:
                toOptionalNumber(matched.weekdayBusinessHours) ??
                toOptionalNumber(matched.dailyBusinessHours),
            }
          : null,
      };
    });

  return NextResponse.json({
    query: queryName || "(全部)",
    normKeyCollisions: collisions,
    matches: matchResults,
    allRetailStores: retailStores.map((r) => ({
      id: r.id,
      storeName: r.storeName,
      normKey: normalizeStoreKey(r.storeName),
      weekdayBusinessHours: toOptionalNumber(r.weekdayBusinessHours),
      dailyBusinessHours: toOptionalNumber(r.dailyBusinessHours),
      saturdayBusinessHours: toOptionalNumber(r.saturdayBusinessHours),
    })),
  });
}
