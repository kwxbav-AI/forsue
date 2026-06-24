import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { StorePortalShell } from "./_components/shell";

export const dynamic = "force-dynamic";

export default async function StorePortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const user = await prisma.appUser.findUnique({
    where: { id: session.userId },
    select: {
      username: true,
      retailStore: { select: { storeName: true, region: true } },
    },
  });

  const storeName = user?.retailStore?.storeName ?? "未知門市";
  const region = user?.retailStore?.region ?? null;
  const username = user?.username ?? session.username;

  return (
    <StorePortalShell storeInfo={{ username, storeName, region }}>
      {children}
    </StorePortalShell>
  );
}
