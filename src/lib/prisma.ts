import { PrismaClient } from "@prisma/client";

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
 * 延遲建立 PrismaClient：避免 Next 建置「收集路由資料」時只要 import 模組就連線／初始化引擎而失敗（例如 Vercel 上 DATABASE_URL 尚未注入的瞬間）。
 * 第一次實際使用 prisma.xxx 時才 new。
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
