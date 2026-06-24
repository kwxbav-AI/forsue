import Link from "next/link";
import { isAuthEnabled } from "@/lib/auth-config";
import { getServerSession } from "@/lib/auth-server";
import {
  canAccessPageDb,
  canAccessReportsSectionDb,
  canAccessWorkhourRelatedSectionDb,
} from "@/lib/permissions-db";

export default async function HomePage() {
  const authOn = isAuthEnabled();
  const session = await getServerSession();

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
    {
      key: "operations",
      href: "/operations/dashboard",
      title: "營運部Dashboard",
      desc: "營運總覽、資料匯入、門市績效與工效比",
    },
    {
      key: "store-portal",
      href: "/store-portal",
      title: "門市入口",
      desc: "業績總覽、月曆達標、出勤紀錄、工時異動填報",
    },
  ] as const;

  const visible = !authOn
    ? cards
    : (
        await Promise.all(
          cards.map(async (c) => {
            if (!session) return { c, ok: false };
            const role = { id: session.roleId, key: session.roleKey };
            let ok = false;
            if (c.key === "workhour") {
              ok = await canAccessWorkhourRelatedSectionDb(role);
            } else if (c.key === "reports") {
              ok = await canAccessReportsSectionDb(role);
            } else if (c.key === "store-portal") {
              ok = await canAccessPageDb(role, "/store-portal/overview");
            } else {
              ok = await canAccessPageDb(role, c.href);
            }
            return { c, ok };
          })
        )
      )
        .filter((x) => x.ok)
        .map((x) => x.c);

  return (
    <div className="p-6 sm:p-8">
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
    </div>
  );
}
