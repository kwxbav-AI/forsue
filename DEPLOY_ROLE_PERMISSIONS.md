# 角色權限（門市人員）上線/部署補充

本檔案補充「門市人員 + DB 權限矩陣」上線時需要注意的環境變數與資料庫流程。

## 需要確認的環境變數

### 必要
- `DATABASE_URL`
  - **用途**：Prisma 連線資料庫
  - **檢查點**：部署環境（例如 Vercel）必須有設定，且可連線

- `AUTH_SECRET`
  - **用途**：登入/Session JWT 的簽章密鑰（middleware 會依此驗證 cookie）
  - **最低要求**：長度至少 **16 字元**
  - **注意**
    - **本機**：可在 `.env` 設定
    - **Vercel**：請到專案的 Environment Variables 新增 `AUTH_SECRET`（Production/Preview/Development 視需求都要設）
    - **一旦變更 `AUTH_SECRET`**：所有既有登入 cookie 會失效，使用者需要重新登入（屬正常現象）

### 建議
- `NODE_ENV`
  - Vercel 會自動處理；本機一般不用特別設

## 資料庫 migration / seed 建議流程

### 情境 A：本機開發（你自己跑起來驗證）
1. 安裝依賴
   - `npm install`
2. 套用 migration（建立/更新權限相關新表）
   - `npm run db:migrate`
3. 執行 seed（寫入 PermissionModule/RolePermission 預設資料）
   - `npm run db:seed`
4. 啟動
   - `npm run dev`

### 情境 B：正式環境（Vercel + Neon/Postgres）
重點：**先 migration，再 seed**（不然 seed 會因表不存在而失敗）。

1. 在部署環境設定環境變數
   - `DATABASE_URL`
   - `AUTH_SECRET`（至少 16 字元）
2. 對正式資料庫套用 migration
   - 方式 1（推薦，從本機/CI 跑一次）：
     - `npx prisma migrate deploy`
   - 方式 2（開發用，不建議直接用在正式）：
     - `npx prisma migrate dev`
3. 對正式資料庫跑 seed（建立預設模組與「門市人員」初始權限）
   - `npm run db:seed`

## 權限「立刻生效」的行為說明
- **頁面顯示/隱藏（導覽、首頁卡片、工時異動入口）**：下一次重新整理/下一次 SSR render 會依 DB 權限更新
- **禁止進入頁面（直接輸入 URL）**：middleware 會導到 `/forbidden`
- **禁止 API（含讀取/寫入）**：middleware 會回 `403`

## 上線後快速自我檢查（建議）
1. 用 `ADMIN` 登入
2. 進入 `設定區` → `角色權限設定`
3. 選擇 `門市人員`
4. 確認初始值（可再自行調整）
   - `/workhour-related`：寫入
   - `/dispatches`：寫入
   - `/workhour-adjustments`：不出現
   - `/batch-workhour-adjustment`：不出現
   - `/store-hour-deductions`：寫入
   - `/content-entries`：寫入
5. 用 `門市人員` 帳號登入測試
   - 允許頁面可進、可正常讀寫
   - 不出現頁面直接導到 `/forbidden`
   - 被禁止的 API 直接回 `403`

