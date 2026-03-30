"use client";

export function AuthLogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:border-sky-400 hover:text-sky-700"
    >
      登出
    </button>
  );
}
