import Link from "next/link";
import { isAuthEnabled } from "@/lib/auth-config";
import { getServerSession } from "@/lib/auth-server";
import { canAccessPageDb } from "@/lib/permissions-db";

const ITEMS = [
  {
    href: "/dispatches",
    title: "一、人員調度",
    description: "新增/修改調度紀錄，依日期與門市填報調入調出與時數",
  },
  {
    href: "/content-entries",
    title: "二、現貨文填報",
    description: "填寫日期、分店、篇數與商品/留言數，自動計算扣工時",
  },
  {
    href: "/store-hour-deductions",
    title: "三、效期/清掃工時",
    description: "依日期、門市填寫效期或清掃扣抵時數，從每日工效比總工時中扣除",
  },
  {
    href: "/workhour-adjustments",
    title: "四、工時異動調整",
    description: "查詢與新增/編輯工時扣抵、類型、備註",
  },
  {
    href: "/batch-workhour-adjustment",
    title: "五、批次調整工時",
    description: "同一日期、原因、扣除時數時，一次勾選多人批次寫入（如店長會議、晉升考核）",
  },
];

export default async function WorkhourRelatedPage() {
  const authOn = isAuthEnabled();
  const session = await getServerSession();
  const items = !authOn
    ? ITEMS
    : (
        await Promise.all(
          ITEMS.map(async (item) => ({
            item,
            ok:
              session != null &&
              (await canAccessPageDb(
                { id: session.roleId, key: session.roleKey },
                item.href
              )),
          }))
        )
      )
        .filter((x) => x.ok)
        .map((x) => x.item);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">工時異動相關</h1>
        <Link
          href="/"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          回首頁
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
          >
            <h2 className="font-medium text-slate-800">{item.title}</h2>
            <p className="mt-2 text-sm text-slate-500">{item.description}</p>
            <span className="mt-3 inline-block rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700">
              前往
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
