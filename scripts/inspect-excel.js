const XLSX = require("xlsx");
const path = process.argv[2] || "c:\\Users\\kwxba\\Downloads\\矮房子媽媽樂團購有限公司_ALL_ALL_20260304-20260304_出勤紀錄 (1).xlsx";

const workbook = XLSX.readFile(path, { cellDates: false, raw: false });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });

console.log("=== Row 0 (header) ===");
console.log(JSON.stringify(rows[0], null, 2));
console.log("\n=== Row 1 (first data) raw ===");
if (rows[1]) {
  const row1 = sheet["A1"] ? XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true })[1] : rows[1];
  console.log(JSON.stringify(rows[1], null, 2));
}
console.log("\n=== First 3 data rows (raw cell types) ===");
for (let r = 1; r <= Math.min(3, rows.length - 1); r++) {
  const row = rows[r];
  console.log("Row", r + 1, row);
}
