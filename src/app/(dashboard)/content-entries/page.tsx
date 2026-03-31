"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { formatLocalDateInput, formatDateOnly } from "@/lib/date";

type Store = {
  id: string;
  code: string | null;
  name: string;
  department?: string | null;
  isActive?: boolean;
};

type Entry = {
  id: string;
  workDate: string;
  branch: string;
  totalArticles: number | null;
  contentDesc1: string | null;
  articleUrl1: string | null;
  productCount1: number | null;
  commentCount1: number | null;
  contentDesc2: string | null;
  articleUrl2: string | null;
  productCount2: number | null;
  commentCount2: number | null;
  contentDesc3: string | null;
  articleUrl3: string | null;
  productCount3: number | null;
  commentCount3: number | null;
  deductedMinutes?: number | null;
};

const CONTENT_OPTIONS = [
  "生活用品",
  "蔬果",
  "冷凍食品",
  "常溫食品",
  "其他",
];

export default function ContentEntriesPage() {
  const [startDate, setStartDate] = useState(() => formatLocalDateInput());
  const [endDate, setEndDate] = useState(() => formatLocalDateInput());
  const [list, setList] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [branchSearch, setBranchSearch] = useState("");
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [form, setForm] = useState({
    workDate: formatLocalDateInput(),
    branch: "",
    totalArticles: "" as string | number,
    contentDesc1: "",
    articleUrl1: "",
    productCount1: "",
    commentCount1: "",
    contentDesc2: "",
    articleUrl2: "",
    productCount2: "",
    commentCount2: "",
    contentDesc3: "",
    articleUrl3: "",
    productCount3: "",
    commentCount3: "",
  });

  const canSeeDeductedMinutes = useMemo(
    () => list.some((r) => typeof (r as any).deductedMinutes !== "undefined"),
    [list]
  );

  const fetchList = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/content-entries?startDate=${startDate}&endDate=${endDate}`
    );
    if (res.ok) setList(await res.json());
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    fetch("/api/stores")
      .then((r) => r.json())
      .then((d: Store[]) => setStores(Array.isArray(d) ? d : []))
      .catch(() => setStores([]));
  }, []);

  const activeStores = useMemo(
    () => stores.filter((s) => s.isActive !== false),
    [stores]
  );

  const filteredStores = useMemo(() => {
    if (!branchSearch.trim()) return activeStores;
    const q = branchSearch.trim().toLowerCase();
    return activeStores.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.code || "").toLowerCase().includes(q) ||
        (s.department || "").toLowerCase().includes(q)
    );
  }, [activeStores, branchSearch]);

  const openAdd = () => {
    setBranchSearch("");
    setBranchDropdownOpen(false);
    setForm({
      workDate: formatLocalDateInput(),
      branch: "",
      totalArticles: "",
      contentDesc1: "",
      articleUrl1: "",
      productCount1: "",
      commentCount1: "",
      contentDesc2: "",
      articleUrl2: "",
      productCount2: "",
      commentCount2: "",
      contentDesc3: "",
      articleUrl3: "",
      productCount3: "",
      commentCount3: "",
    });
    setModal("add");
    setEditingId(null);
  };

  const openEdit = (row: Entry) => {
    setBranchSearch("");
    setBranchDropdownOpen(false);
    setForm({
      workDate: formatWorkDate(row.workDate),
      branch: row.branch,
      totalArticles: row.totalArticles ?? "",
      contentDesc1: row.contentDesc1 ?? "",
      articleUrl1: row.articleUrl1 ?? "",
      productCount1: String(row.productCount1 ?? ""),
      commentCount1: String(row.commentCount1 ?? ""),
      contentDesc2: row.contentDesc2 ?? "",
      articleUrl2: row.articleUrl2 ?? "",
      productCount2: String(row.productCount2 ?? ""),
      commentCount2: String(row.commentCount2 ?? ""),
      contentDesc3: row.contentDesc3 ?? "",
      articleUrl3: row.articleUrl3 ?? "",
      productCount3: String(row.productCount3 ?? ""),
      commentCount3: String(row.commentCount3 ?? ""),
    });
    setModal("edit");
    setEditingId(row.id);
  };

  const submit = async () => {
    const payload = {
      workDate: form.workDate,
      branch: form.branch.trim(),
      totalArticles: form.totalArticles === "" ? null : Number(form.totalArticles),
      contentDesc1: form.contentDesc1.trim() || null,
      articleUrl1: form.articleUrl1.trim() || null,
      productCount1: form.productCount1 === "" ? null : Number(form.productCount1),
      commentCount1: form.commentCount1 === "" ? null : Number(form.commentCount1),
      contentDesc2: form.contentDesc2.trim() || null,
      articleUrl2: form.articleUrl2.trim() || null,
      productCount2: form.productCount2 === "" ? null : Number(form.productCount2),
      commentCount2: form.commentCount2 === "" ? null : Number(form.commentCount2),
      contentDesc3: form.contentDesc3.trim() || null,
      articleUrl3: form.articleUrl3.trim() || null,
      productCount3: form.productCount3 === "" ? null : Number(form.productCount3),
      commentCount3: form.commentCount3 === "" ? null : Number(form.commentCount3),
    };

    if (modal === "add") {
      const res = await fetch("/api/content-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setModal(null);
        fetchList();
      } else {
        const data = await res.json();
        alert(data.error || "新增失敗");
      }
    } else if (editingId) {
      const res = await fetch(`/api/content-entries/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setModal(null);
        setEditingId(null);
        fetchList();
      } else {
        const data = await res.json();
        alert(data.error || "更新失敗");
      }
    }
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("確定刪除此筆？")) return;
    const res = await fetch(`/api/content-entries/${id}`, { method: "DELETE" });
    if (res.ok) fetchList();
  };

  const formatWorkDate = (workDate: string) => {
    try {
      return formatDateOnly(new Date(workDate));
    } catch {
      return workDate.slice(0, 10);
    }
  };

  const formatDeducted = (min: number | null) => {
    if (min == null) return "—";
    if (min < 60) return `${min} 分鐘`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} 小時 ${m} 分鐘` : `${h} 小時`;
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">內容篇數填報（含扣工時）</h1>
        <Link
          href="/"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          回首頁
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-600">起日</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-600">迄日</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={openAdd}
          className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700"
        >
          新增一筆
        </button>
      </div>

      {modal && (
        <div className="fixed inset-0 z-10 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="w-full max-w-4xl rounded-lg bg-white p-6 shadow-lg">
            <h2 className="mb-4 font-medium text-slate-800">
              {modal === "add" ? "新增填報" : "編輯填報"}
            </h2>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <label className="flex items-center gap-2">
                <span className="w-20 text-slate-600">日期</span>
                <input
                  type="date"
                  value={form.workDate}
                  onChange={(e) => setForm((f) => ({ ...f, workDate: e.target.value }))}
                  className="flex-1 rounded border border-slate-300 px-2 py-1.5"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-slate-600">分店（關聯門市）</span>
                <div className="relative">
                  <input
                    type="text"
                    value={branchDropdownOpen ? branchSearch : form.branch}
                    onChange={(e) => {
                      setBranchSearch(e.target.value);
                      setBranchDropdownOpen(true);
                      if (!e.target.value) setForm((f) => ({ ...f, branch: "" }));
                    }}
                    onFocus={() => {
                      setBranchDropdownOpen(true);
                      if (form.branch) setBranchSearch(form.branch);
                    }}
                    onBlur={() => setTimeout(() => setBranchDropdownOpen(false), 180)}
                    placeholder="請搜尋或選擇門市（名稱、代碼、部門）"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  {branchDropdownOpen && (
                    <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded border border-slate-200 bg-white py-1 shadow-lg">
                      {filteredStores.length === 0 ? (
                        <li className="px-2 py-2 text-sm text-slate-500">無符合的門市</li>
                      ) : (
                        filteredStores.map((s) => (
                          <li
                            key={s.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setForm((f) => ({ ...f, branch: s.name }));
                              setBranchSearch("");
                              setBranchDropdownOpen(false);
                            }}
                            className="cursor-pointer px-2 py-1.5 text-sm hover:bg-slate-100"
                          >
                            {s.name}
                            {s.department ? `（${s.department}）` : ""}
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
              </label>
              <label className="flex items-center gap-2">
                <span className="w-20 text-slate-600">總篇數</span>
                <input
                  type="number"
                  min={0}
                  value={form.totalArticles}
                  onChange={(e) => setForm((f) => ({ ...f, totalArticles: e.target.value }))}
                  className="flex-1 rounded border border-slate-300 px-2 py-1.5"
                />
              </label>
            </div>
            <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="rounded border border-slate-200 bg-slate-50/50 p-3">
                  <div className="mb-2 font-medium text-slate-700">第 {n} 篇</div>
                  <label className="block">
                    <span className="text-slate-600">內容說明</span>
                    <select
                      value={n === 1 ? form.contentDesc1 : n === 2 ? form.contentDesc2 : form.contentDesc3}
                      onChange={(e) =>
                        setForm((f) => {
                          if (n === 1) {
                            return { ...f, contentDesc1: e.target.value };
                          }
                          if (n === 2) {
                            return { ...f, contentDesc2: e.target.value };
                          }
                          return { ...f, contentDesc3: e.target.value };
                        })
                      }
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                    >
                      <option value="">—</option>
                      {CONTENT_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-2 block">
                    <span className="text-slate-600">篇數{n}(網址)</span>
                    <input
                      type="url"
                      value={n === 1 ? form.articleUrl1 : n === 2 ? form.articleUrl2 : form.articleUrl3}
                      onChange={(e) =>
                        setForm((f) =>
                          n === 1
                            ? { ...f, articleUrl1: e.target.value }
                            : n === 2
                              ? { ...f, articleUrl2: e.target.value }
                              : { ...f, articleUrl3: e.target.value }
                        )
                      }
                      placeholder="https://..."
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                    />
                  </label>
                  <label className="mt-2 block">
                    <span className="text-slate-600">商品數量</span>
                    <input
                      type="number"
                      min={0}
                      value={n === 1 ? form.productCount1 : n === 2 ? form.productCount2 : form.productCount3}
                      onChange={(e) =>
                        setForm((f) =>
                          n === 1
                            ? { ...f, productCount1: e.target.value }
                            : n === 2
                              ? { ...f, productCount2: e.target.value }
                              : { ...f, productCount3: e.target.value }
                        )
                      }
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                    />
                  </label>
                  <label className="mt-2 block">
                    <span className="text-slate-600">留言數量</span>
                    <input
                      type="number"
                      min={0}
                      value={n === 1 ? form.commentCount1 : n === 2 ? form.commentCount2 : form.commentCount3}
                      onChange={(e) =>
                        setForm((f) =>
                          n === 1
                            ? { ...f, commentCount1: e.target.value }
                            : n === 2
                              ? { ...f, commentCount2: e.target.value }
                              : { ...f, commentCount3: e.target.value }
                        )
                      }
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                    />
                  </label>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submit}
                className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700"
              >
                儲存
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">載入中…</p>
        ) : list.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">此區間尚無填報資料。</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100">
                <th className="whitespace-nowrap px-2 py-2 text-left font-medium text-slate-700">
                  日期
                </th>
                <th className="whitespace-nowrap px-2 py-2 text-left font-medium text-slate-700">
                  分店
                </th>
                <th className="whitespace-nowrap px-2 py-2 text-right font-medium text-slate-700">
                  總篇數
                </th>
                <th className="whitespace-nowrap px-2 py-2 text-left font-medium text-slate-700">
                  內容說明1
                </th>
                <th className="whitespace-nowrap px-2 py-2 text-left font-medium text-slate-700">
                  篇數1(網址)
                </th>
                <th className="whitespace-nowrap px-2 py-2 text-right font-medium text-slate-700">
                  商品1
                </th>
                <th className="whitespace-nowrap px-2 py-2 text-right font-medium text-slate-700">
                  留言1
                </th>
                <th className="whitespace-nowrap px-2 py-2 text-left font-medium text-slate-700">
                  內容說明2
                </th>
                <th className="whitespace-nowrap px-2 py-2 text-left font-medium text-slate-700">
                  篇數2(網址)
                </th>
                <th className="whitespace-nowrap px-2 py-2 text-right font-medium text-slate-700">
                  商品2
                </th>
                <th className="whitespace-nowrap px-2 py-2 text-right font-medium text-slate-700">
                  留言2
                </th>
                <th className="whitespace-nowrap px-2 py-2 text-left font-medium text-slate-700">
                  內容說明3
                </th>
                <th className="whitespace-nowrap px-2 py-2 text-left font-medium text-slate-700">
                  篇數3(網址)
                </th>
                <th className="whitespace-nowrap px-2 py-2 text-right font-medium text-slate-700">
                  商品3
                </th>
                <th className="whitespace-nowrap px-2 py-2 text-right font-medium text-slate-700">
                  留言3
                </th>
                {canSeeDeductedMinutes ? (
                  <th className="whitespace-nowrap px-2 py-2 text-right font-medium text-slate-700">
                    扣工時
                  </th>
                ) : null}
                <th className="whitespace-nowrap px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-2 py-1.5">{formatWorkDate(row.workDate)}</td>
                  <td className="px-2 py-1.5 font-medium">{row.branch}</td>
                  <td className="px-2 py-1.5 text-right">{row.totalArticles ?? "—"}</td>
                  <td className="px-2 py-1.5 text-slate-600">{row.contentDesc1 ?? "—"}</td>
                  <td className="max-w-[120px] px-2 py-1.5">
                    {row.articleUrl1 ? (
                      <a
                        href={/^https?:\/\//i.test(row.articleUrl1) ? row.articleUrl1 : `https://${row.articleUrl1}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-600 hover:underline"
                        title={row.articleUrl1}
                      >
                        連結
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">{row.productCount1 ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right">{row.commentCount1 ?? "—"}</td>
                  <td className="px-2 py-1.5 text-slate-600">{row.contentDesc2 ?? "—"}</td>
                  <td className="max-w-[120px] px-2 py-1.5">
                    {row.articleUrl2 ? (
                      <a
                        href={/^https?:\/\//i.test(row.articleUrl2) ? row.articleUrl2 : `https://${row.articleUrl2}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-600 hover:underline"
                        title={row.articleUrl2}
                      >
                        連結
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">{row.productCount2 ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right">{row.commentCount2 ?? "—"}</td>
                  <td className="px-2 py-1.5 text-slate-600">{row.contentDesc3 ?? "—"}</td>
                  <td className="max-w-[120px] px-2 py-1.5">
                    {row.articleUrl3 ? (
                      <a
                        href={/^https?:\/\//i.test(row.articleUrl3) ? row.articleUrl3 : `https://${row.articleUrl3}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-600 hover:underline"
                        title={row.articleUrl3}
                      >
                        連結
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">{row.productCount3 ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right">{row.commentCount3 ?? "—"}</td>
                  {canSeeDeductedMinutes ? (
                    <td className="px-2 py-1.5 text-right font-medium text-slate-800">
                      {formatDeducted(row.deductedMinutes ?? null)}
                    </td>
                  ) : null}
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      className="text-sky-600 hover:underline"
                    >
                      編輯
                    </button>
                    <span className="mx-1 text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => deleteEntry(row.id)}
                      className="text-red-600 hover:underline"
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
