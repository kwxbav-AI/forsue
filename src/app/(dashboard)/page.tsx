import Link from "next/link";
import { isAuthEnabled } from "@/lib/auth-config";
import { getServerSession } from "@/lib/auth-server";

export default async function HomePage() {
  const authOn = isAuthEnabled();
  const session = await getServerSession();
  const canEdit =
    !authOn ||
    (session != null &&
      (session.role === "ADMIN" || session.role === "EDITOR"));

  const cards = [
    {
      key: "uploads",
      href: "/uploads",
      title: "資料上傳中心",
      desc: "上傳出勤、營收、人員名冊",
    },
    {
      key: "workhour",
      href: "/workhour-related",
      title: "工時異動相關",
      desc: "人員調度、工時異動調整、內容篇數填報、批次調整、效期/清掃",
    },
    {
      key: "reports",
      href: "/reports",
      title: "報表區",
      desc: "每日工效比、達標次數統計",
    },
    {
      key: "data",
      href: "/data",
      title: "資料區",
      desc: "人員出勤表、每日營收報表",
    },
    {
      key: "settings",
      href: "/settings",
      title: "設定區",
      desc: "門市管理、儲備人力設定、假日設定、目標值設定、帳號權限",
    },
  ] as const;

  const visible = cards.filter((c) => {
    if (!authOn) return true;
    if (canEdit) return true;
    return c.key === "reports" || c.key === "data";
  });

  return (
    <div className="p-6 sm:p-8">
      <div className="mb-6 flex items-center gap-2 text-sm text-sky-600">
        <span className="rounded bg-sky-100 px-2 py-0.5 font-medium">網頁版</span>
      </div>
      <p className="mb-8 text-slate-600">
        在瀏覽器中使用：上傳 Excel、查詢工效比、達標統計、工時異動與目標設定
      </p>
      <nav className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((c) => (
          <Link
            key={c.key}
            href={c.href}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
          >
            <span className="font-medium text-slate-800">{c.title}</span>
            <p className="mt-1 text-sm text-slate-500">{c.desc}</p>
          </Link>
        ))}
      </nav>
      <footer className="mt-12 border-t border-slate-200 pt-6 text-center text-sm text-slate-500">
        本系統為網頁版，請在瀏覽器開啟此頁面使用。執行{" "}
        <code className="rounded bg-slate-200 px-1">npm run dev</code> 後訪問
        <code className="ml-1 rounded bg-slate-200 px-1">http://localhost:3000</code> 即可。
      </footer>
    </div>
  );
}
