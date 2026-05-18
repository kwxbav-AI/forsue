# 同事協作指南（GitHub 共編）

## 第一次加入

1. Clone 專案：`git clone <repo-url>`
2. 複製環境變數：`cp .env.example .env`
3. 向專案管理員索取 **開發用** `DATABASE_URL`（存於 1Password 等，**勿**在 GitHub issue 貼出）
4. 執行：

   ```bash
   npm install
   npx prisma generate
   npx prisma migrate deploy
   npm run db:check
   npm run dev
   ```

5. 瀏覽器開 http://localhost:3000

完整說明：[docs/團隊共用開發資料庫.md](docs/團隊共用開發資料庫.md)

## 每日開發

```bash
git pull
npx prisma migrate deploy   # 有 migration 更新時
npm run dev
```

## 請勿提交

- `.env`、`.env.local`（含資料庫密碼）
- 任何含 `DATABASE_URL` 真值的檔案

## 資料庫與報表

- 營收報表、圖表、營運 Dashboard 共用同一 `DATABASE_URL`
- 本機若無資料，先執行 `npm run db:check` 或見 [本機開發連雲端資料庫.md](docs/本機開發連雲端資料庫.md)

## 權限與登入

- 登入帳號存在資料庫 `AppUser` 表；dev 庫需由管理員建立或 seed
