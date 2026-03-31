"use client";

import { Suspense, useState } from "react";

function safeNextPath(next: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

function LoginFormInner({ nextParam }: { nextParam: string }) {
  const safeNext = safeNextPath(nextParam || "/");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "same-origin",
        cache: "no-store",
      });
      let data: { error?: string } = {};
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        try {
          data = (await res.json()) as { error?: string };
        } catch {
          data = {};
        }
      }
      if (!res.ok) {
        setError(
          data.error ||
            (res.status >= 500
              ? `伺服器暫時無法回應（${res.status}），請稍後再試或洽管理員。`
              : "登入失敗")
        );
        return;
      }
      window.location.href = safeNext;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "無法連線到伺服器，請檢查網路或稍後再試。";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      action={`/login/submit?next=${encodeURIComponent(safeNext)}`}
      method="POST"
      className="mx-auto w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div>
        <label className="block text-sm text-slate-600" htmlFor="username">
          帳號
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-slate-900"
          required
        />
      </div>
      <div>
        <label className="block text-sm text-slate-600" htmlFor="password">
          密碼
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-slate-900"
          required
        />
      </div>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
      >
        {loading ? "登入中…" : "登入"}
      </button>
    </form>
  );
}

export function LoginForm({ nextParam }: { nextParam: string }) {
  return (
    <Suspense fallback={<p className="text-center text-slate-500">載入中…</p>}>
      <LoginFormInner nextParam={nextParam} />
    </Suspense>
  );
}
