import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

function getSortKey(code: string): string {
  // 讓 A2 < A10：字母 + 數字補零
  const m = code.trim().toUpperCase().match(/^([A-Z]+)(\d+)?$/);
  if (!m) return code.trim().toUpperCase();
  const prefix = m[1];
  const num = m[2] ? m[2].padStart(4, "0") : "0000";
  return `${prefix}${num}`;
}

function getStorePosSortKey(store: { code: string | null; aliases: { code: string }[] }): string {
  const codes = [
    ...(store.code ? [store.code] : []),
    ...store.aliases.map((a) => a.code),
  ]
    .map((c) => c.trim())
    .filter(Boolean);
  if (codes.length === 0) return "ZZZZ9999";
  return codes.map(getSortKey).sort()[0];
}

export async function GET() {
  const stores = await prisma.store.findMany({
    include: { aliases: true },
  });
  const sorted = [...stores].sort((a, b) => {
    const ka = getStorePosSortKey(a);
    const kb = getStorePosSortKey(b);
    if (ka !== kb) return ka.localeCompare(kb);
    return a.name.localeCompare(b.name, "zh-Hant");
  });

  return NextResponse.json(
    sorted.map((s) => {
      const aliasCodes = s.aliases
        .map((a) => a.code)
        .filter((code) => code && code !== s.code);
      return {
        id: s.id,
        code: s.code,
        name: s.name,
        department: s.department,
        isActive: s.isActive,
        aliases: aliasCodes,
      };
    })
  );
}

const bodySchema = z.object({
  name: z.string().min(1),
  department: z.string().optional().nullable(),
  code: z.string().optional().nullable(),
  aliases: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "欄位錯誤", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { name, department, code, aliases } = parsed.data;
    const storeName = name.trim();
    const dept = department?.trim() || null;
    const aliasList = (aliases ?? []).map((a) => a.trim()).filter(Boolean);
    let storeCode = code?.trim() || null;
    if (!storeCode && aliasList.length) {
      // 預設用第一組 POS 代碼當「主 POS」（用於營收計算）
      storeCode = aliasList[0];
    }

    const result = await prisma.$transaction(async (tx) => {
      // 若門市已存在（即使之前停用），改為啟用並更新
      const store = await tx.store.upsert({
        where: { name: storeName },
        update: {
          isActive: true,
          ...(storeCode ? { code: storeCode } : {}),
          ...(dept !== null ? { department: dept } : {}),
        },
        create: { name: storeName, code: storeCode, department: dept, isActive: true },
      });

      if (aliasList.length) {
        // 移除該門市不再使用的 aliases
        await tx.storeAlias.deleteMany({
          where: { storeId: store.id, code: { notIn: aliasList } },
        });
        // 將 alias code 指向這個門市（code unique，必要時會搬移）
        for (const a of aliasList) {
          await tx.storeAlias.upsert({
            where: { code: a },
            update: { storeId: store.id },
            create: { code: a, storeId: store.id },
          });
        }
      }

      const withAliases = await tx.store.findUnique({
        where: { id: store.id },
        include: { aliases: true },
      });
      return withAliases!;
    });

    const aliasCodes = result.aliases
      .map((a) => a.code)
      .filter((code) => code && code !== result.code);

    return NextResponse.json({
      id: result.id,
      name: result.name,
      code: result.code,
      department: result.department,
      aliases: aliasCodes,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "新增門市失敗" },
      { status: 500 }
    );
  }
}
