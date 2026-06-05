import { OPS_COLORS } from "@/lib/ops-color-tokens";

export function StoreOpsPageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="mb-5 flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3"
      style={{
        backgroundColor: OPS_COLORS.achievement.bg,
        borderColor: OPS_COLORS.achievement.border,
      }}
    >
      <div>
        <h1 className="text-xl font-bold" style={{ color: OPS_COLORS.achievement.value }}>
          {title}
        </h1>
        {subtitle ?
          <p className="mt-1 text-sm" style={{ color: OPS_COLORS.achievement.label }}>
            {subtitle}
          </p>
        : null}
      </div>
      {action}
    </div>
  );
}
