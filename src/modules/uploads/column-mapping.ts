/**
 * Excel 欄位對應：欄位名稱可在此統一調整，parser 透過此 mapping 讀取
 * 實際 Excel 欄名可能有前後空白，由 normalizer 處理
 */

export const ATTENDANCE_COLUMNS = {
  workDate: ["工作日期", "出勤日期", "上班日期", "出勤日", "日期", "workDate", "date", "Date"],
  employeeCode: ["員工代碼", "員工編號", "employeeCode", "工號", "編號", "員工ID"],
  employeeName: ["員工姓名", "姓名", "employeeName", "name", "名稱"],
  storeCode: ["門市代碼", "門市", "storeCode", "店別", "店號", "所屬門市"],
  department: ["部門", "部門名稱", "門市部門", "單位", "組別", "區域-門市"],
  workHours: ["工時", "工作時數", "workHours", "時數", "hours", "出勤時數", "總工時", "工時數", "實際工時", "上班時數"],
  scheduledWorkHours: ["表定工時", "表訂工時", "表訂時數", "表定時數", "應出勤時數", "應出勤工時", "scheduledWorkHours", "scheduledHours"],
  startTime: ["上班", "上班時間", "上班打卡時間", "簽到時間", "出勤時間(起)", "出勤起"],
  endTime: ["下班", "下班時間", "下班打卡時間", "簽退時間", "出勤時間(迄)", "出勤迄"],
  // 注意：這兩欄是「含地點的文字資訊」，不是純時間欄位
  clockInInfo: ["上班資訊", "上班打卡資訊", "上班資訊(含地點)", "clockInInfo", "clockInInfoRaw"],
  clockOutInfo: ["下班資訊", "下班打卡資訊", "下班資訊(含地點)", "clockOutInfo", "clockOutInfoRaw"],
  // 班別/假別：用來辨識請假（含半天），避免用工時門檻誤傷兼職
  shiftType: ["班別", "班型", "shiftType", "班次", "假別", "出勤狀態", "狀態"],
} as const;

export const DISPATCH_COLUMNS = {
  workDate: ["調度日期", "日期", "workDate", "date"],
  employeeCode: ["員工代碼", "員工編號", "employeeCode", "工號"],
  fromStoreCode: ["調出店", "原門市", "fromStore", "fromStoreCode"],
  toStoreCode: ["調入店", "支援門市", "toStore", "toStoreCode"],
  dispatchHours: ["調度時數", "時數", "dispatchHours", "hours"],
  remark: ["備註", "remark", "說明"],
} as const;

export const EMPLOYEE_MASTER_COLUMNS = {
  employeeCode: ["員工代碼", "員工編號", "employeeCode", "工號", "編號", "代碼", "員工ID", "ID", "代號", "員編", "Employee Code", "Code", "Staff Code"],
  name: ["姓名", "員工姓名", "name", "員工名稱", "名稱", "名字", "Name", "Employee Name", "Staff Name"],
  storeCode: ["門市代碼", "所屬門市", "storeCode", "defaultStore", "門市", "店別", "店號"],
  position: ["職稱", "職位", "position", "職務"],
  hireDate: ["到職日", "到職日期", "報到日", "入職日", "到任日", "hireDate", "joinDate", "employmentDate"],
} as const;

export const REVENUE_COLUMNS = {
  revenueDate: ["營收日期", "交易日期", "交班日期", "日期", "revenueDate", "date", "Date"],
  storeCode: ["門市代碼", "門市", "storeCode", "店別", "店號", "櫃檯號碼", "櫃檯", "櫃號"],
  checkoutNo: ["結帳單號", "結帳單號碼", "交班單號", "日結單號", "單號", "checkoutNo", "receiptNo"],
  revenueAmount: [
    "合計總額",
    "營收金額",
    "營收",
    "結帳總金額",
    "結帳單張結帳總金額",
    "總金額",
    "revenueAmount",
    "金額",
    "amount",
  ],
  cashIncome: ["現金收入"],
  linePayAmount: ["LinePay實付合計總額", "LinePay實付金額"],
  expenseAmount: ["支出總額", "退貨總金額"],
} as const;

export type ColumnMapping = Record<string, readonly string[]>;

/** 正規化表頭儲存格（去空白、去（必填）等後綴） */
function normalizeHeaderCell(cell: string): string {
  return cell
    .trim()
    .replace(/\s*[（(]?\s*必填\s*[)）]?\s*$/, "")
    .replace(/\s*\*?\s*$/, "")
    .trim();
}

/** 從第一列找出對應欄位索引（欄名先 trim、可含（必填）後綴） */
export function findColumnIndex(
  row: unknown[],
  possibleNames: readonly string[]
): number {
  const normalized = (row as string[]).map((c) => normalizeHeaderCell(String(c ?? "")));
  for (const name of possibleNames) {
    const idx = normalized.findIndex(
      (cell) => cell === name || cell.toUpperCase() === name.toUpperCase()
    );
    if (idx >= 0) return idx;
  }
  return -1;
}

/** 建立該表頭的欄位索引 map */
export function buildHeaderMap(
  firstRow: unknown[],
  columnDef: ColumnMapping
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const [key, names] of Object.entries(columnDef)) {
    const idx = findColumnIndex(firstRow, names as readonly string[]);
    if (idx >= 0) map[key] = idx;
  }
  return map;
}
