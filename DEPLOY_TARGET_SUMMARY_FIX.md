## 部署說明：`target-summary` 修正後的重新部署

此文件用來在你已完成程式修正（包含 `target-summary` 的工作日/週日邏輯與計算分母）之後，進行「重新部署」並確認報表結果正確。

---

### 0. 部署前檢查（必做）

1. 確認你已在正確專案目錄（`daily-performance-system`）完成修改。
2. 重新建置一次（確保 type check / compile 通過）：
   - `npm run build`
3. 確認環境變數正確（例如 `.env` / 你的部署環境設定）。
4. 確認假日設定資料來源正確（`settings/holidays` 或對應表）。

---

### 1A. 若你用 Vercel 部署

下面把「同步到 Vercel 連的 Git 儲存庫」拆成更細的做法。你只要照你目前的狀況選其中一條路徑即可。

#### 路徑 A：本機已是 git repo，且已連到 GitHub（最常見）

1. 到專案目錄：
   `cd d:\程式碼製作\daily-performance-system`
2. 確認有沒有未提交變更：
   `git status`
3. 確認 `origin` 之類的遠端倉庫已設定：
   `git remote -v`
4. 建立 commit（注意：不要把 `.env`（含密碼）提交上去；通常 `.env` 會被 `.gitignore` 忽略）：
   `git add -A`
   `git commit -m "Fix target-summary total working days"`
5. 推送到 Vercel 會看的分支（通常是 `main`；如果你不知道，請看 Vercel 專案的 Git 設定或分支名稱）：
   `git push -u origin main`
   若你其實推的是其他分支，請用同一個分支推上去
6. 回到 Vercel 專案後等待自動部署：
   Vercel 通常會在偵測到 push 後自動跑新部署（Production/Preview 取決於設定）
   若沒有自動跑，進專案後點 `Redeploy`/`Deployments` 手動觸發

#### 路徑 B：本機不是 git repo（你目前的情況可能符合這個）

1. 到專案目錄：
   `cd d:\程式碼製作\daily-performance-system`
2. 初始化 git 並連上你在 GitHub 的 repo（把 `你的帳號/你的倉庫名稱` 換成實際值）：
   `git init`
   `git add .`
   `git commit -m "Initial commit"`
   `git branch -M main`
   `git remote add origin https://github.com/你的帳號/你的倉庫名稱.git`
   `git push -u origin main`
3. 若你已經有 commit，只是之前沒初始化/沒連遠端，就跳過 commit 部分，直接把程式 push 到 Vercel 看的分支即可。

> 重點提醒：只要「你有把程式碼 push 到 Vercel 連的 repo 分支」，就不需要在 Vercel 內手動上傳檔案；Vercel 會依設定自動重新部署。

#### 同步完成後（共同步驟）

1. 等待部署狀態變成 `Production` 成功（或至少是你要驗證的環境成功）。
2. 在 Vercel 的 `Deployments` 或 `Build Logs` 確認最後的狀態是成功；若失敗，通常要看環境變數或 build logs。

---

### 1B. 若你是自架 Next.js（Node + `next start`，Windows）

建議做法是「每次部署都先 `build` 再以 production 模式啟動」。

1. 到專案目錄：
   - `cd d:\程式碼製作\daily-performance-system`
2. 安裝依賴（若你部署環境已經有可用的 `node_modules`，可跳過）：
   - `npm ci`（或 `npm install`）
3. 建置：
   - `npm run build`
4. 停止舊服務（請用你目前的方式停止：例如 PM2 / Windows 服務 / 手動關掉進程）
5. 啟動新服務（兩種常見方式擇一）：
   - 直接啟動：
     - `npm run start`
   - 或用 `next start`：
     - `npx next start -p <PORT>`
6. 確認服務啟動成功後再進行報表驗證。

---

### 2. 驗證步驟（務必做）

在 UI 的「達標次數統計」或對應報表頁面設定查詢區間為：

- `2026/03/02` ～ `2026/03/30`

你應該看到：

1. `總天數` 不應再出現 `31`
2. 若假日設定中沒有額外假日，且「週日不算工作天」，則工作日數理論上為：
   - 29 個日曆日
   - 扣掉區間內週日（2026/03/08、15、22、29 共 4 天）
   - 工作日應為 `25`

若你實際假日設定不為空，`總天數` 會比 `25` 再少（這是正常的）。

---

### 3. 若結果仍不對（請回報我這三個資訊）

1. 部署方式是 `Vercel / 自架 Node / Docker / 其他`
2. 報表頁目前顯示的 `總天數`、`達標天數`、`未達標天數`（或分母/分子對應欄位）
3. `settings/holidays` 中，3 月那段區間（02～30）是否有額外假日

