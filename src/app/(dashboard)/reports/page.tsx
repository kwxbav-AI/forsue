import Link from "next/link";
import { isAuthEnabled } from "@/lib/auth-config";
import { getServerSession } from "@/lib/auth-server";
import { canAccessPageDb } from "@/lib/permissions-db";

export default async function ReportsHubPage() {
  const authOn = isAuthEnabled();
  const session = await getServerSession();

  const cards = [
    {
      key: "daily",
      href: "/performance/daily",
      title: "每日工效比",
      desc: "查看每日各門市營收、工時、工效比、是否達標",
    },
    {
      key: "charts",
      href: "/reports/charts",
      title: "圖表",
      desc: "區間加總（全門市營收/工時）、排序與工效比長條圖",
    },
    {
      key: "target-summary",
      href: "/performance/target-summary",
      title: "達標次數統計",
      desc: "期間內各門市達標天數、達標率、平均工效比",
    },
  ] as const;

  const visible = !authOn
    ? cards
    : (
        await Promise.all(
          cards.map(async (c) => ({
            c,
            ok:
              session != null &&
              (await canAccessPageDb({ id: session.roleId, key: session.roleKey }, c.href)),
          }))
        )
      )
        .filter((x) => x.ok)
        .map((x) => x.c);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">報表區</h1>
        <Link
          href="/"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          回首頁
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
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
      </div>
    </div>
  );
}

