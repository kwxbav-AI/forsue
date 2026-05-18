const fs = require("fs");
const path = require("path");

/** 載入專案根目錄 .env，再以 .env.local 覆寫（與 Next.js 順序一致） */
function loadEnvFiles(rootDir) {
  for (const name of [".env", ".env.local"]) {
    const filePath = path.join(rootDir, name);
    if (!fs.existsSync(filePath)) continue;

    const text = fs.readFileSync(filePath, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

function maskDatabaseUrl(url) {
  if (!url) return "(未設定 DATABASE_URL)";
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const isLocal =
      host === "localhost" || host === "127.0.0.1" || host === "::1";
    const kind = isLocal ? "本機資料庫" : "雲端／遠端資料庫";
    const user = u.username ? `${u.username.slice(0, 2)}***@` : "";
    return {
      masked: `${u.protocol}//${user}${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`,
      isLocal,
      kind,
      host: u.hostname,
    };
  } catch {
    return { masked: "(無法解析 DATABASE_URL)", isLocal: null, kind: "未知", host: "" };
  }
}

module.exports = { loadEnvFiles, maskDatabaseUrl };
