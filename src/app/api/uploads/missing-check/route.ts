import { NextResponse } from "next/server";
import { getMissingUploadWarnings } from "@/modules/uploads/services/upload-status.service";

export const dynamic = "force-dynamic";

/** 檢查近期（排除今明兩天上傳寬限期）是否有門市營收或出勤表尚未上傳 */
export async function GET() {
  const result = await getMissingUploadWarnings();
  return NextResponse.json(result);
}
