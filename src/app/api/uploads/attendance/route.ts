import { NextRequest, NextResponse } from "next/server";
import { uploadAttendance } from "@/modules/uploads/services/upload.service";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { success: false, errors: [{ row: 0, message: "請選擇檔案" }] },
        { status: 400 }
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadedBy = (formData.get("uploadedBy") as string) || undefined;
    const result = await uploadAttendance(buffer, file.name, uploadedBy);
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { success: false, errors: [{ row: 0, message: e instanceof Error ? e.message : "上傳失敗" }] },
      { status: 500 }
    );
  }
}
