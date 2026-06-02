import { redirect } from "next/navigation";

/** 活動成效功能已停用 */
export default function OperationsMarketingPage() {
  redirect("/operations/dashboard");
}
