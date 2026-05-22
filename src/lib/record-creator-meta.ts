import { prisma } from "@/lib/prisma";

const TAIPEI_TZ = "Asia/Taipei";

/** 填寫時間（台北） */
export function formatFilledAtTaipei(createdAt: Date): string {
  return createdAt.toLocaleString("zh-TW", {
    timeZone: TAIPEI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export async function resolveCreatorNamesByCode(
  codes: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
  if (unique.length === 0) return new Map();
  const employees = await prisma.employee.findMany({
    where: { employeeCode: { in: unique } },
    select: { employeeCode: true, name: true },
  });
  return new Map(employees.map((e) => [e.employeeCode, e.name]));
}

export function creatorDisplayName(
  code: string | null | undefined,
  nameByCode: Map<string, string>
): string | null {
  const c = code?.trim();
  if (!c) return null;
  return nameByCode.get(c) ?? c;
}
