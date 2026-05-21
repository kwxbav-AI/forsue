export default function OperationsDashboardLoading() {
  return (
    <div className="animate-pulse space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-9 w-36 rounded-lg bg-slate-200" />
        <div className="h-9 w-36 rounded-lg bg-slate-200" />
        <div className="h-9 w-28 rounded-lg bg-slate-200" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-xl border border-slate-200 bg-white shadow-sm"
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-56 rounded-xl border border-slate-200 bg-white lg:col-span-2" />
        <div className="h-56 rounded-xl border border-slate-200 bg-white" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="h-48 rounded-xl border border-slate-200 bg-white" />
        <div className="h-48 rounded-xl border border-slate-200 bg-white" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 h-5 w-32 rounded bg-slate-200" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
