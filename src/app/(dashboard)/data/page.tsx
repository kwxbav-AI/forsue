import Link from "next/link";
import { isAuthEnabled } from "@/lib/auth-config";
import { getServerSession } from "@/lib/auth-server";
import { canAccessPageDb } from "@/lib/permissions-db";

export default async function DataHubPage() {
  const authOn = isAuthEnabled();
  const session = await getServerSession();

  const cards = [
    {
      key: "attendance",
      href: "/reports/attendance",
      title: "人員出勤表",
      desc: "依員工與部門查詢每日出勤工時",
    },
    {
      key: "revenue",
      href: "/reports/revenue",
      title: "每日營收報表",
      desc: "依門市與部門查詢每日營收與短溢",
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
        <h1 className="text-xl font-bold text-slate-800">資料區</h1>
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

