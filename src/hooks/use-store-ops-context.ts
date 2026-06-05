"use client";

import { useCallback, useEffect, useState } from "react";
import type { RoleKey } from "@/lib/roles";

export type StoreOpsStore = {
  id: string;
  storeName: string;
  region: string | null;
};

export type StoreOpsContext = {
  roleKey: RoleKey | string;
  username: string;
  allowedStoreIds: string[] | null;
  stores: StoreOpsStore[];
};

export function useStoreOpsContext() {
  const [ctx, setCtx] = useState<StoreOpsContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/operations/store-ops/context");
      if (!res.ok) {
        setError("無法載入門市範圍");
        setCtx(null);
        return;
      }
      setCtx(await res.json());
    } catch {
      setError("載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const defaultStoreId = ctx?.stores[0]?.id ?? "";

  return { ctx, loading, error, reload, defaultStoreId };
}
