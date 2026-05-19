import Link from "next/link";

export default function OperationsWorkHoursPage() {
  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">人員工時</h1>
      <p className="mt-2 text-sm text-slate-600">
        工時資料來自出勤上傳與即時計算。請使用下列頁面查看明細與異常。
      </p>
      <ul className="mt-4 space-y-2 text-sm">
        <li>
          <Link href="/performance/daily" className="text-blue-700 hover:underline">
            每日工效比與當日工時明細
          </Link>
        </li>
        <li>
          <Link href="/reports/attendance" className="text-blue-700 hover:underline">
            出勤報表
          </Link>
        </li>
        <li>
          <Link href="/workhour-related" className="text-blue-700 hover:underline">
            工時異動相關
          </Link>
        </li>
      </ul>
    </div>
  );
}
