import Link from "next/link";

export default function OperationsCompensationPage() {
  return (
    <div className="p-6 max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">獎金規則</h1>
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-slate-800">
        <p className="font-semibold">業務規則（已確認）</p>
        <ul className="mt-2 list-disc list-inside space-y-1 text-slate-700">
          <li>每月總達標次數 × 168 元</li>
          <li>加上營運成果獎金</li>
          <li>達標定義與每日工效比相同（平日 ≥ 4,000、週六 ≥ 5,500 元/hr）</li>
        </ul>
      </div>
      <p className="text-sm text-slate-500">C 階段將實作自動計算與匯出。</p>
      <Link href="/operations/dashboard" className="inline-block text-blue-700 text-sm hover:underline">
        返回營運總覽
      </Link>
    </div>
  );
}
