import { PrismaClient } from "@prisma/client";

/**
 * 全應用程式共用單一 PrismaClient，避免 dev 熱重載或多人連線時耗盡 DB 連線池。
 * 所有 API route / service 請一律：`import { prisma } from "@/lib/prisma"`
 * 勿在業務程式碼中 `new PrismaClient()`（seed / scripts 除外）。
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrisma(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrisma();
  }
  return globalForPrisma.prisma;
}

/**
 * 延遲建立：Next 建置收集路由時不立即連線（DATABASE_URL 可能尚未注入）。
 * 第一次使用 `prisma.xxx` 時才初始化並快取於 globalThis。
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
});
