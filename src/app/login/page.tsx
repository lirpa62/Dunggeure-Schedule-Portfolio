"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AdminLoginForm } from "@/components/auth/AdminLoginForm";

function getSafeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/schedule";
  }
  if (value.startsWith("/login")) return "/schedule";
  return value;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const returnTo = getSafeReturnTo(searchParams.get("returnTo"));

  return (
    <div
      className="relative flex min-h-screen items-center justify-center bg-cover bg-center bg-no-repeat px-4 font-hakgyoansimnadeuri"
      style={{ backgroundImage: "url('/bg_dung_and_gree.jpg')" }}
    >
      <div className="absolute inset-0 bg-[var(--bg)]/55 backdrop-blur-[1px]" />
      <div className="relative z-10 w-full max-w-sm">
        <Link
          href="/schedule"
          className="mb-6 inline-flex items-center gap-1 rounded-full bg-dunggeure-primary/30 px-3 py-1.5 text-sm text-dunggeure-lighter shadow-sm backdrop-blur transition hover:text-dunggeure-primary"
        >
          <ChevronLeft size={16} /> 일정표로
        </Link>

        <div className="rounded-2xl border border-[var(--border)] p-6 shadow-xl bg-dunggeure-primary/30 backdrop-blur-md">
          <AdminLoginForm returnTo={returnTo} />
        </div>
      </div>
    </div>
  );
}
