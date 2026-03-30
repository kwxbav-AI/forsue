# Vercel 部署步驟（一步一步）

本教學假設你已有 **PostgreSQL**（例如 Neon），且專案程式碼會放在 **GitHub**。完成後會得到類似 `https://你的專案.vercel.app` 的網址。

---

## 你需要準備的東西

| 項目 | 說明 |
|------|------|
| GitHub 帳號 | 用來放程式碼、讓 Vercel 自動部署 |
| 雲端 PostgreSQL | 連線字串 `DATABASE_URL`（若沿用 Neon，見下一節） |
| 約 15～30 分鐘 | 第一次設定帳號與環境變數 |

---

## 步驟 1：確認雲端資料庫（Neon 為例）

若你**還沒有**雲端資料庫：

1. 開啟 [https://neon.tech](https://neon.tech)，註冊並登入。
2. 建立 **New Project**，區域可選 **Singapore（新加坡）** 等離台灣較近者。
3. 建立完成後，在儀表板找到 **Connection string**，複製整串（格式通常以 `postgresql://` 開頭）。
4. 建議使用 **Direct** 或一般連線（若列表有 Pooler / Direct，可先試 **Direct**，與本機／Vercel 相容性較單純）。
5. 把這串 **先貼在記事本備用**，步驟 5 會用到。

若你**已有** Neon／其他 PostgreSQL，只要取得 **正確的 `DATABASE_URL`** 即可。

---

## 步驟 2：把程式碼放到 GitHub

若專案**還沒**用 Git 連到 GitHub：

1. 在 [https://github.com/new](https://github.com/new) 建立一個新 **Repository**（名稱自訂，例如 `daily-performance-system`），**不要**勾選自動建立 README（若本機已有專案）。
2. 在本機專案資料夾開啟終端機（PowerShell 或 CMD），依序執行（請改成你的帳號與倉庫名稱）：

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/你的帳號/你的倉庫名稱.git
git push -u origin main
```

3. 確認 `.gitignore` 內有 **`.env`**（不要把密碼推上 GitHub）。

若專案**已經**在 GitHub 上，只要確認 **最新程式碼已 push** 即可。

---

## 步驟 3：在 Vercel 建立帳號並連結 GitHub

1. 開啟 [https://vercel.com](https://vercel.com)，用 **Sign Up** 註冊（建議選 **Continue with GitHub**）。
2. 若出現授權畫面，允許 Vercel 讀取你的 GitHub 倉庫（至少要能選到要部署的那個 repo）。

---

## 步驟 4：匯入專案（Import Project）

1. 在 Vercel 儀表板點 **Add New…** → **Project**。
2. 在 **Import Git Repository** 列表中，找到 **daily-performance-system**（或你的倉庫名），點 **Import**。
3. **Configure Project** 頁面通常不用改：
   - **Framework Preset**：Next.js
   - **Root Directory**：`./`（專案在倉庫根目錄時）
   - **Build Command**：`next build`（預設即可）
   - **Output Directory**：預設即可

---

## 步驟 5：設定環境變數（非常重要）

在 **Environment Variables** 區塊，至少新增下列變數（建議 **Production、Preview、Development** 三種環境都勾選，或至少勾 **Production**）。

### 5.1 資料庫（必填）

| Name | Value |
|------|--------|
| `DATABASE_URL` | 貼上 Neon（或其他）給你的 **完整** PostgreSQL 連線字串 |

### 5.2 網頁登入（若你要在線上開啟登入）

| Name | Value |
|------|--------|
| `AUTH_SECRET` | 至少 **16 字元**的隨機字串（例如本機執行 `openssl rand -base64 32` 產生） |

未設定 `AUTH_SECRET` 時，網站**不會**強制登入（與本機未設時類似）。若要對外使用帳號密碼，請務必設定。

### 5.3 其他（選填）

一般不需要在 Vercel 設定 `SEED_ADMIN_*`；建立第一個管理員帳號請在本機用 **seed**（見步驟 7）。

---

## 步驟 6：第一次 Deploy

1. 確認環境變數已新增後，點 **Deploy**。
2. 等待建置日誌跑完（約 1～3 分鐘）。若失敗，點進 **Build Logs** 查看錯誤（常見為環境變數錯字、或資料庫連不到）。
3. 成功後會出現 **Congratulations** 畫面，點 **Visit** 或用畫面上的 **`.vercel.app` 網址** 開啟網站。

---

## 步驟 7：資料庫結構與第一個管理員（本機執行）

Vercel **不會**自動幫你執行 `prisma migrate`，需要在你**本機**（或任何能連到同一個資料庫的環境）執行一次：

1. 在本機專案的 `.env` 裡，暫時把 `DATABASE_URL` 設成 **與 Vercel 相同**的那串雲端連線（或另開一個 `.env.production.local` 只放雲端 URL，依你習慣）。
2. 在專案資料夾執行：

```bash
npx prisma migrate deploy
```

3. 若尚無登入帳號，執行（會依 `prisma/seed.js` 建立門市等，並在 **沒有任何 AppUser 時**建立預設管理員）：

```bash
npm run db:seed
```

預設管理員帳號常為 **`admin`**、密碼 **`ChangeMe123!`**（除非你設了 `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`）。**上線後請立刻變更密碼**，或在 seed 前改環境變數。

4. 把本機 `.env` 改回你平常開發用的設定（避免誤連正式庫）。

---

## 步驟 8：之後更新程式

每次在本機 **commit** 並 **push** 到 GitHub 後，Vercel 會自動偵測並重新部署。幾分鐘後網址上的版本就會更新。

---

## 常見狀況

| 狀況 | 可能原因與處理 |
|------|----------------|
| Build 失敗、提到 Prisma | 確認專案已含 `postinstall`（`prisma generate`）；重新部署一次。 |
| 網站 500、資料庫錯誤 | 檢查 Vercel **Environment Variables** 的 `DATABASE_URL` 是否正確、是否已 **Redeploy**。 |
| 無法登入 | 是否已 `migrate deploy` + `db:seed`？是否已設 `AUTH_SECRET`？ |
| 想換自己的網域 | Vercel 專案 → **Settings** → **Domains** 依說明新增 DNS。 |

---

## 與 Render 的差異（簡述）

在 **Vercel 免費方案** 上，Next.js 專案通常**不會**像 Render 免費 Web Service 那樣長時間出現「整站休眠後要醒很久」的黑畫面；體感上多半較即時。若仍覺得第一次操作稍慢，多半是 **Serverless 冷啟動**或 **資料庫連線**，屬正常範圍。

---

完成以上步驟後，你就有一個 **Vercel 網址** 可給同事使用。若某一步卡住，把 **Vercel Build Logs 的錯誤訊息**（可打馬賽克密碼）貼出來，比較好排查。
