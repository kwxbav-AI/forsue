import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function maskDatabaseUrl(url: string | undefined) {
  if (!url) return { masked: "(未設定)", isLocal: null as boolean | null, kind: "未知" };
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const isLocal =
      host === "localhost" || host === "127.0.0.1" || host === "::1";
    const user = u.username ? `${u.username.slice(0, 2)}***@` : "";
    return {
      masked: `${u.protocol}//${user}${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`,
      isLocal,
      kind: isLocal ? "本機資料庫" : "雲端／遠端資料庫",
    };
  } catch {
    return { masked: "(無法解析)", isLocal: null, kind: "未知" };
  }
}

/** 僅開發環境：檢查目前連線的 DB 是否有上傳資料 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const db = maskDatabaseUrl(process.env.DATABASE_URL);

  try {
    const [revenueTotal, attendanceTotal, revenueApr] = await Promise.all([
      prisma.revenueRecord.count(),
      prisma.attendanceRecord.count(),
      prisma.revenueRecord.count({
        where: {
          revenueDate: {
            gte: new Date("2026-04-01T00:00:00+08:00"),
            lte: new Date("2026-04-10T23:59:59.999+08:00"),
          },
        },
      }),
    ]);

    const hasUploadData = revenueTotal > 0 && attendanceTotal > 0;
    const likelyEmptyLocal = db.isLocal === true && !hasUploadData;

    return NextResponse.json({
      database: db,
      counts: {
        revenueTotal,
        attendanceTotal,
        revenueApr2026_04_01_to_10: revenueApr,
      },
      hasUploadData,
      likelyEmptyLocal,
      hint: likelyEmptyLocal
        ? "本機連到 localhost 資料庫且無上傳資料。請將 .env 的 DATABASE_URL 改為與 Vercel 相同的雲端連線後重啟 npm run dev。詳見 docs/本機開發連雲端資料庫.md"
        : hasUploadData
          ? "資料庫內有營收與出勤，報表與 Dashboard 應可正常顯示。"
          : "資料庫可連線但尚無營收／出勤，請確認 DATABASE_URL 是否為正式環境。",
    });
  } catch (error) {
    return NextResponse.json(
      {
        database: db,
        error: error instanceof Error ? error.message : "資料庫連線失敗",
        hint: "請檢查 .env 的 DATABASE_URL 並執行 npm run db:check",
      },
      { status: 500 }
    );
  }
}
