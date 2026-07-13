# CLAUDE.md

給任何在此專案工作的 Claude Code 工作階段的規則。

## ⚠️ 營收日期查詢：一律用 UTC 邊界，不要用台北時區邊界

`RevenueRecord.revenueDate` 是 `@db.Date` 欄位，寫入時用 `toStartOfDay`／`parseDateOnlyUTC`（**UTC 日曆日**）。查詢這個欄位（或任何用同樣方式寫入的 `@db.Date` 欄位）時，**必須**用 UTC 邊界（`parseDateOnlyUTC` + `endOfDayUTC`，或 `toDateRange`），**絕對不要**用台北時區邊界（`calendarDayBoundsFromYmd`、`toDateRangeTaipei`、`formatDateOnlyTaipei`）。

### 為什麼

Prisma 對 `@db.Date` 欄位的查詢參數，是取傳入 Date 物件的 **UTC 曆日**去比對。台北時區邊界的起點（例如 `2026-06-30T00:00:00+08:00`）換算成 UTC 是 `2026-06-29T16:00:00Z`，UTC 曆日是 `06-29`——用這個當查詢下界，會讓「查 6/30」的範圍**多含 6/29 一整天**，導致單日查詢把前一天的營收也加總進去，營收虛增、工效比跟著虛增。

### 已知受影響、且必須維持 UTC 邊界的地方

- `src/modules/performance/services/daily-store-metrics.service.ts` — `computeDailyMetricsByStore`、`computeDailyRevenueOnlyByStore` 兩個函式查 `revenueRecord` 都要用 `parseDateOnlyUTC(businessYmd)` + `endOfDayUTC(businessYmd)`
- `src/modules/performance/services/range-daily-metrics-prefetch.service.ts` — `buildRangeDailyMetricsPrefetch` 查 `revenueRecord` 要用 `toDateRange(startYmd, endYmd)`；把查到的 `revenueRow` 依日期分桶時，要用 `formatDateOnly`（UTC）而不是 `formatDateOnlyTaipei`
- `src/app/api/reports/revenue/route.ts` — 已經是正確的參考範例（用 `toDateRange`），註解裡也寫了原因

### 事故紀錄（避免重蹈覆轍）

1. **2026-05-26**：營收報表單日查詢誤含前一日，修正為 `toDateRange`（commit `2fb8f43`）。
2. **2026-07-09**：另一次修改（commit `5825dda`，理由是「修正工效比空白」）把 `daily-store-metrics.service.ts` 和 `range-daily-metrics-prefetch.service.ts` 改回台北時區邊界，等於重新引入同一個 bug，這次波及「每日工效比」頁面跟營運成果獎金池，全店、全月多天營收/獎金金額被虛增。
3. **2026-07-10**：抓出並修正（比對使用者提供的實際數字驗證：6/30 全店營收虛增金額 = 6/29 當日營收）。
4. **2026-07-13**：另一個工作階段處理 git rebase 衝突時，誤判方向又把這兩處改回台北時區邊界（commit `f726d4c`），當天發現後立刻修回。

**如果你被要求「修正工效比空白／某天查不到營收」之類的問題，先假設問題出在別的地方（例如查詢範圍太窄、資料本身沒有匯入），不要把上述兩個檔案的日期查詢改成台北時區邊界來「修」——這個方向已經被驗證是錯的，改了會造成營收/獎金虛增，而不是解決問題。**

若懷疑真的有「台北午夜前後資料抓不到」的個案，請先跟使用者確認具體是哪一天、哪家店，再針對該筆資料的實際儲存值排查，不要整批改查詢方向。
