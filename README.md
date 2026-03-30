# 每日績效計算系統

依「每日績效系統規劃書」開發的 Web 系統，支援 Excel 上傳、工時計算、工效比與達標統計、目標值設定。

## 技術棧

- **前端**: Next.js 14 (App Router)、TypeScript、Tailwind CSS
- **後端**: Next.js Route Handlers、Prisma ORM、PostgreSQL
- **檔案解析**: xlsx

## 環境需求

- Node.js 18+
- PostgreSQL

## 安裝與執行

1. 複製環境變數：
   ```bash
   cp .env.example .env
   ```
2. 編輯 `.env`，設定 `DATABASE_URL`（PostgreSQL 連線字串）。

3. 安裝依賴：
   ```bash
   npm install
   ```

4. 建立資料庫與執行 migration：
   ```bash
   npx prisma db push
   ```
   或使用 migration：
   ```bash
   npx prisma migrate dev --name init
   ```

5. 執行 seed（可選，建立範例門市、員工、目標值）：
   ```bash
   npx prisma db seed
   ```
   （若 seed 報錯，可先執行 `npx prisma generate`）

6. 啟動開發伺服器：
   ```bash
   npm run dev
   ```

7. 開啟瀏覽器訪問 http://localhost:3000

## 讓同事一起使用（網頁版分享）

### 方式一：同辦公室／同 WiFi（最簡單）

適合只有同事在**同一網路**（例如公司 WiFi）要一起用，用一台電腦當主機即可。

1. **選一台電腦當主機**  
   - 這台電腦要一直開著、並執行本程式。  
   - 需已安裝 Node.js、PostgreSQL，且本專案與資料庫都設定好（`.env` 的 `DATABASE_URL` 正確）。

2. **查主機的 IP 位址**  
   - **Windows**：命令提示字元輸入 `ipconfig`，看「IPv4 位址」（例如 `192.168.1.100`）。  
   - **Mac**：系統設定 → 網路 → 進階 → TCP/IP，看 IPv4 位址。

3. **讓程式可被同網段連線**  
   在專案資料夾執行：
   ```bash
   npm run dev:share
   ```
   這會用 `0.0.0.0` 監聽，同一網路的人才能連進來。

4. **同事開啟網頁**  
   - 同事的電腦或手機連**同一個 WiFi**。  
   - 瀏覽器網址輸入：`http://主機的IP:3000`  
   - 例如：`http://192.168.1.100:3000`

5. **注意**  
   - 主機若關機或關掉終端機，其他人就連不到。  
   - 若公司有防火牆，需允許 port 3000 的連線。

---

### 方式二：正式上線（有網址、外網可連）

希望**有固定網址**、不在公司也能用（例如在家、出差），就要把程式與資料庫都放到網路上。  
👉 **逐步教學**：[對外網址部署步驟](docs/對外網址部署步驟.md)（Neon + GitHub + Vercel）  
👉 **只部署到 Vercel（分步說明）**：[Vercel部署步驟](docs/Vercel部署步驟.md)

1. **資料庫**  
   - 使用**雲端 PostgreSQL**（例如 [Neon](https://neon.tech)、[Supabase](https://supabase.com)、[Railway](https://railway.app) 等）。  
   - 建立一個資料庫，取得連線字串（例如 `postgresql://user:pass@host/dbname`）。  
   - 在本機先測試：把 `.env` 的 `DATABASE_URL` 改成這個連線字串，執行 `npx prisma migrate deploy` 與 `npx prisma db seed`（如需要），確認功能正常。

2. **部署網站**  
   - **推薦：Vercel**（專案是 Next.js，一鍵部署）  
     - 到 [vercel.com](https://vercel.com) 註冊，用 GitHub 登入。  
     - 匯入本專案（Git 需先 push 到 GitHub）。  
     - 在 Vercel 專案設定裡加入「環境變數」：`DATABASE_URL` = 上面雲端資料庫的連線字串。  
     - 部署完成後會得到網址，例如 `https://daily-performance-xxx.vercel.app`。  
   - 同事只要用這個網址即可，不需同網路。

3. **其他選擇**  
   - **Render**、**Railway**：可同時架網站 + PostgreSQL，適合不想分開申請資料庫的人。  
   - **自架主機／VPS**：在伺服器上裝 Node、PostgreSQL，執行 `npm run build` 與 `npm run start`，再設定 Nginx 或反向代理對外提供 80/443。

---

### 小結

| 情境           | 做法                     | 同事怎麼開 |
|----------------|--------------------------|------------|
| 只給辦公室用   | 一台電腦跑 `npm run dev:share` | 瀏覽器打 `http://主機IP:3000` |
| 要有網址、到處用 | 資料庫上雲 + Vercel 等部署     | 瀏覽器打你得到的網址 |

## 功能概覽（MVP）

- **資料上傳中心** (`/uploads`)：上傳人員出勤表、人員調度表、人員名冊、每日營收、現貨文頁面（.xlsx）
- **工時異動調整** (`/workhour-adjustments`)：依日期/門市查詢，新增/刪除工時異動（類型：現貨文、效期、清掃、其他）
- **每日工效比** (`/performance/daily`)：依日期查詢各門市營收、總工時、工效比、是否達標，可展開門市明細
- **達標次數統計** (`/performance/target-summary`)：日期區間內各門市達標天數、達標率、平均工效比
- **目標值設定** (`/settings/performance-target`)：設定全門市共用目標工效值與生效日，保留歷史設定

## Excel 欄位對應

欄位對應可於 `src/modules/uploads/column-mapping.ts` 調整，目前預設接受下列欄名（任一種即可）：

- **出勤表**: 工作日期、員工代碼、工時（必填）；門市代碼、班別等選填
- **調度表**: 調度日期、員工代碼、調入店、調度時數（必填）；調出店、備註選填
- **人員名冊**: 員工代碼、姓名（必填）；門市代碼、職稱選填
- **每日營收**: 營收日期、門市代碼、營收金額（必填）

## API 摘要

- `POST /api/uploads/attendance`、`/dispatch`、`/employee-master`、`/daily-revenue`、`/inventory-reference`：上傳對應 Excel
- `GET/POST /api/workhour-adjustments`、`PUT/DELETE /api/workhour-adjustments/:id`：工時異動
- `GET /api/performance/daily?date=`：每日績效列表
- `GET /api/performance/daily/detail?date=&storeId=`：單門市當日工時明細
- `POST /api/performance/recalculate-daily`：重算（body: `{ date }` 或 `{ startDate, endDate }`）
- `GET /api/performance/target-summary?startDate=&endDate=`：達標統計
- `GET/POST /api/settings/performance-target`、`PUT /api/settings/performance-target/:id`：目標值設定
- `GET /api/stores`、`GET /api/employees`：門市與員工列表

## 後續可擴充（規劃書 Phase 4）

- 每週分析頁、每月營收報表頁
- 匯出 Excel/CSV
- 完整 Audit Log（誰在何時修改了什麼）
