import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
      <h1 className="text-lg font-semibold text-amber-900">權限不足</h1>
      <p className="mt-2 text-sm text-amber-800">
        您的帳號無法存取此頁面。若需要權限，請聯絡管理員。
      </p>
      <Link
        href="/"
        className="mt-4 inline-block rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
      >
        回首頁
      </Link>
    </div>
  );
}
