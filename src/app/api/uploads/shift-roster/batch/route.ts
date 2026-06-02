import { NextRequest, NextResponse } from "next/server";
import { uploadShiftRosterBatch } from "@/modules/uploads/services/upload.service";

export const dynamic = "force-dynamic";

const MAX_FILES = 20;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const uploadedBy = (formData.get("uploadedBy") as string) || undefined;
    const replaceEntireDatesRaw = formData.get("replaceEntireDates");
    const replaceEntireDates =
      replaceEntireDatesRaw === "true" || replaceEntireDatesRaw === "1";

    const fromFiles = formData
      .getAll("files")
      .filter((v): v is File => v instanceof File && v.size > 0);
    const single = formData.get("file");
    const legacyFile = single instanceof File && single.size > 0 ? [single] : [];
    const fileList = fromFiles.length > 0 ? fromFiles : legacyFile;

    if (fileList.length === 0) {
      return NextResponse.json(
        { success: false, errors: [{ row: 0, message: "請選擇檔案" }] },
        { status: 400 }
      );
    }
    if (fileList.length > MAX_FILES) {
      return NextResponse.json(
        {
          success: false,
          errors: [{ row: 0, message: `一次最多上傳 ${MAX_FILES} 個檔案` }],
        },
        { status: 400 }
      );
    }

    const payloads = await Promise.all(
      fileList.map(async (file) => ({
        buffer: Buffer.from(await file.arrayBuffer()),
        originalName: file.name,
      }))
    );

    const result = await uploadShiftRosterBatch(payloads, uploadedBy, {
      replaceEntireDates,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      {
        success: false,
        errors: [{ row: 0, message: e instanceof Error ? e.message : "上傳失敗" }],
      },
      { status: 500 }
    );
  }
}
