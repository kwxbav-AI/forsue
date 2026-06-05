import { OPS_COLORS } from "@/lib/ops-color-tokens";

type SupplyStatus = "PENDING" | "APPROVED" | "REJECTED" | "SHIPPED" | "RECEIVED";

type SupplyFlowProps = {
  status: SupplyStatus;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  shippedAt?: string | null;
  receivedAt?: string | null;
  rejectReason?: string | null;
};

const STEPS = [
  { key: "submit", label: "已提出" },
  { key: "review", label: "督導審核" },
  { key: "ship", label: "總務配送" },
  { key: "receive", label: "門市確認收到" },
] as const;

function fmtTime(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function stepState(
  status: SupplyStatus,
  stepKey: (typeof STEPS)[number]["key"]
): "done" | "active" | "waiting" | "rejected" {
  if (status === "REJECTED") {
    if (stepKey === "submit") return "done";
    if (stepKey === "review") return "rejected";
    return "waiting";
  }
  const order = ["PENDING", "APPROVED", "SHIPPED", "RECEIVED"] as const;
  const idx = order.indexOf(status);
  const stepIdx = { submit: 0, review: 1, ship: 2, receive: 3 }[stepKey];
  if (idx > stepIdx) return "done";
  if (idx === stepIdx) return "active";
  return "waiting";
}

export function SupplyFlowBadge({
  status,
  submittedAt,
  reviewedAt,
  shippedAt,
  receivedAt,
  rejectReason,
}: SupplyFlowProps) {
  const timestamps: Record<string, string | null> = {
    submit: fmtTime(submittedAt),
    review: fmtTime(reviewedAt),
    ship: fmtTime(shippedAt),
    receive: fmtTime(receivedAt),
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {STEPS.map((step, i) => {
        const state = stepState(status, step.key);
        const bg =
          state === "done" ? OPS_COLORS.hours.chart
          : state === "active" ? OPS_COLORS.achievement.chart
          : state === "rejected" ? OPS_COLORS.status.unmet.value
          : OPS_COLORS.status.none.border;
        const textColor = state === "waiting" ? OPS_COLORS.status.none.label : "#fff";
        const ts = timestamps[step.key];

        return (
          <div key={step.key} className="flex items-center gap-2">
            <div className="group relative">
              <div
                className="rounded-full px-3 py-1 text-xs font-medium"
                style={{ backgroundColor: bg, color: textColor }}
                title={
                  state === "rejected" && rejectReason ?
                    `督導退回：${rejectReason}`
                  : ts ?
                    ts
                  : undefined
                }
              >
                {state === "rejected" ? "督導退回" : step.label}
              </div>
              {state === "rejected" && rejectReason ?
                <div
                  className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-max max-w-xs rounded border bg-white px-2 py-1 text-xs shadow group-hover:block"
                  style={{
                    borderColor: OPS_COLORS.status.unmet.border,
                    color: OPS_COLORS.status.unmet.value,
                  }}
                >
                  {rejectReason}
                </div>
              : null}
              {ts && state !== "rejected" ?
                <p className="mt-0.5 text-[10px] text-slate-400">{ts}</p>
              : null}
            </div>
            {i < STEPS.length - 1 ?
              <span className="text-slate-300">→</span>
            : null}
          </div>
        );
      })}
    </div>
  );
}
