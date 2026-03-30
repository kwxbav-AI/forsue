import { redirect } from "next/navigation";
import { isAuthEnabled } from "@/lib/auth-config";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "登入｜每日績效計算系統",
};

export default function LoginPage() {
  if (!isAuthEnabled()) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-16">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-xl font-semibold text-slate-800">每日績效計算系統</h1>
        <p className="mt-1 text-sm text-slate-500">請輸入帳號與密碼</p>
      </div>
      <div className="mx-auto mt-8 max-w-md">
        <LoginForm />
      </div>
    </div>
  );
}
