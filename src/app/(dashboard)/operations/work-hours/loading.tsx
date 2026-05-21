export default function OperationsWorkHoursLoading() {
  return (
    <div className="animate-pulse space-y-5 p-6 max-w-7xl">
      <div className="h-8 w-48 rounded-lg bg-slate-200" />
      <div className="flex gap-2">
        <div className="h-9 w-20 rounded-lg bg-slate-200" />
        <div className="h-9 w-24 rounded-lg bg-slate-200" />
        <div className="h-9 w-32 rounded-lg bg-slate-200" />
      </div>
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-24 rounded bg-slate-200" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="h-64 rounded-xl border border-slate-200 bg-white" />
    </div>
  );
}
