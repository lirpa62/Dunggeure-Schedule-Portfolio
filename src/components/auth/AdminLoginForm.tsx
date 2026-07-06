"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { useAuthStore } from "@/stores";

type AdminLoginFormProps = {
  returnTo?: string;
  onSuccess?: () => void;
};

function getSafeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/schedule";
  }
  if (value.startsWith("/login")) return "/schedule";
  return value;
}

export function AdminLoginForm({
  returnTo = "/schedule",
  onSuccess,
}: AdminLoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const usernameInputRef = useRef<HTMLInputElement | null>(null);
  const newPasswordInputRef = useRef<HTMLInputElement | null>(null);

  const router = useRouter();
  const { user, setUser, hydrate, deferPasswordChangeForSession } =
    useAuthStore();
  const safeReturnTo = getSafeReturnTo(returnTo);

  useEffect(() => {
    if (user?.must_change_password) {
      setMustChangePassword(true);
    }
  }, [user?.must_change_password]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (mustChangePassword) {
        newPasswordInputRef.current?.focus();
        return;
      }
      usernameInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [mustChangePassword]);

  const finishLogin = () => {
    onSuccess?.();
    router.push(safeReturnTo);
    router.refresh();
  };

  const handleAdminLogin = async () => {
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "로그인에 실패했습니다.");
        return;
      }

      setUser(data.user, data.token);
      if (data.must_change_password) {
        setMustChangePassword(true);
        return;
      }

      finishLogin();
    } catch {
      setError("로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    setError("");
    if (newPassword !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (newPassword.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/admin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "비밀번호 변경에 실패했습니다.");
        return;
      }

      await hydrate();
      finishLogin();
    } catch {
      setError("오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeferPasswordChange = () => {
    deferPasswordChangeForSession();
    finishLogin();
  };

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-dunggeure-primary/30 text-dunggeure-lighter">
          <Shield size={20} />
        </div>
        <h2 className="text-2xl font-bold text-dunggeure-lighter">
          {mustChangePassword ? "비밀번호 변경" : "관리자 로그인"}
        </h2>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-600">
          {error}
        </div>
      )}

      {mustChangePassword ? (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (loading) return;
            handleChangePassword();
          }}
        >
          <p className="text-center text-sm text-[var(--text-secondary)]">
            최초 로그인입니다. 새로운 비밀번호를 설정해주세요.
          </p>
          <input
            ref={newPasswordInputRef}
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="새 비밀번호 (8자 이상)"
            autoComplete="new-password"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm outline-none transition focus:border-dunggeure-primary"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="비밀번호 확인"
            autoComplete="new-password"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm outline-none transition focus:border-dunggeure-primary"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-dunggeure-primary py-3 font-medium text-white transition hover:bg-dunggeure-dark disabled:opacity-50"
          >
            {loading ? "처리 중..." : "비밀번호 변경"}
          </button>
          <button
            type="button"
            onClick={handleDeferPasswordChange}
            disabled={loading}
            className="w-full rounded-xl border border-[var(--border)] py-3 font-medium text-[var(--text-secondary)] transition hover:bg-dunggeure-lighter/30 hover:text-dunggeure-primary disabled:opacity-50"
          >
            다음에 변경하기
          </button>
          <p className="text-center text-xs text-[var(--text-secondary)]">
            이번 브라우저 세션에서는 비밀번호 변경 화면으로 자동 이동하지
            않습니다.
          </p>
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (loading || !username || !password) return;
            handleAdminLogin();
          }}
        >
          <input
            ref={usernameInputRef}
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="관리자 아이디"
            autoComplete="username"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm outline-none transition focus:border-dunggeure-primary"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            autoComplete="current-password"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm outline-none transition focus:border-dunggeure-primary"
          />
          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full rounded-xl bg-dunggeure-primary py-3 font-medium text-white transition hover:bg-dunggeure-dark disabled:opacity-50"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>
      )}
    </div>
  );
}
