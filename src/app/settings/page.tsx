"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, ChevronLeft, Loader2, Trash2, Upload, X } from "lucide-react";
import { useAuthStore } from "@/stores";
import { AppDialog } from "@/components/common/AppDialog";
import type { User } from "@/types";

function getSafeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//"))
    return "/schedule";
  if (value.startsWith("/settings") || value.startsWith("/login"))
    return "/schedule";
  return value;
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAdmin, hydrated, setUser, token } = useAuthStore();

  const redirectTo = getSafeReturnTo(searchParams.get("returnTo"));

  useEffect(() => {
    if (hydrated && !user) router.replace("/login?returnTo=/settings");
  }, [hydrated, user, router]);

  if (!hydrated || !user) return null;

  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 py-6">
      <div className="max-w-md mx-auto font-hakgyoansimnadeuri">
        <Link
          href="/schedule"
          className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-dunggeure-primary mb-6 transition"
        >
          <ChevronLeft size={16} /> 시간표로
        </Link>

        <h1 className="text-2xl font-bold text-dunggeure-dark mb-6">설정</h1>

        <ProfileImageSection
          currentUser={user}
          onUpdate={(u) => setUser(u, token)}
        />

        <NicknameSection
          currentNickname={user.nickname}
          onUpdate={(u) => setUser(u, token)}
        />

        {isAdmin && <AdminPasswordSection redirectTo={redirectTo} />}
      </div>
    </div>
  );
}

function ProfileImageSection({
  currentUser,
  onUpdate,
}: {
  currentUser: User;
  onUpdate: (user: User) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState(currentUser.avatar_url || "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (selectedFile) return;
    setPreviewUrl(currentUser.avatar_url || "");
  }, [currentUser.avatar_url, selectedFile]);

  useEffect(() => {
    if (!selectedFile) return;
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  const pickFile = (file: File | undefined) => {
    setMessage(null);
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
        file.type,
      )
    ) {
      setMessage({
        type: "error",
        text: "jpeg, png, webp, gif 이미지만 등록할 수 있습니다.",
      });
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setMessage({
        type: "error",
        text: "프로필 이미지는 3MB 이하여야 합니다.",
      });
      return;
    }
    setSelectedFile(file);
  };

  const upload = async () => {
    if (!selectedFile) {
      setMessage({ type: "error", text: "등록할 이미지를 선택해주세요." });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const res = await fetch("/api/auth/avatar", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({
          type: "error",
          text: data.error ?? "프로필 이미지 등록 실패",
        });
        return;
      }
      onUpdate(data.user);
      setSelectedFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setMessage({ type: "success", text: "프로필 이미지가 변경되었습니다." });
    } finally {
      setLoading(false);
    }
  };

  const remove = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/avatar", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setMessage({
          type: "error",
          text: data.error ?? "프로필 이미지 삭제 실패",
        });
        return;
      }
      onUpdate(data.user);
      setSelectedFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setMessage({
        type: "success",
        text: "프로필 이미지가 기본값으로 돌아갔습니다.",
      });
    } finally {
      setLoading(false);
    }
  };

  const clearSelection = () => {
    setSelectedFile(null);
    if (inputRef.current) inputRef.current.value = "";
    setPreviewUrl(currentUser.avatar_url || "");
    setMessage(null);
  };

  return (
    <section className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-5 mb-4">
      <h2 className="text-base font-semibold mb-3">프로필 이미지</h2>
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-dunggeure-primary/10 ring-1 ring-dunggeure-light/60">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-dunggeure-primary">
              {currentUser.nickname.slice(0, 1)}
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-black/35 py-1 text-white">
            <Camera size={14} />
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(event) => pickFile(event.target.files?.[0])}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-medium transition hover:bg-dunggeure-primary/10 disabled:opacity-50"
            >
              <Upload size={15} />
              선택
            </button>
            <button
              type="button"
              onClick={upload}
              disabled={loading || !selectedFile}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-dunggeure-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-dunggeure-dark disabled:opacity-50"
            >
              {loading && selectedFile ? (
                <Loader2 size={15} className="animate-spin" />
              ) : null}
              등록
            </button>
          </div>
          {(currentUser.avatar_url || selectedFile) && (
            <button
              type="button"
              onClick={selectedFile ? clearSelection : remove}
              disabled={loading || (!currentUser.avatar_url && !selectedFile)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-500 transition hover:bg-red-50 disabled:opacity-50"
            >
              {selectedFile ? <X size={15} /> : <Trash2 size={15} />}
              {selectedFile ? "선택 취소" : "기본 이미지로 변경"}
            </button>
          )}
          <p className="text-xs text-[var(--text-secondary)]">
            3MB 이하의 jpeg, png, webp, gif 파일을 사용할 수 있습니다.
          </p>
          {message && (
            <p
              className={`text-xs ${message.type === "success" ? "text-green-600" : "text-red-600"}`}
            >
              {message.text}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function NicknameSection({
  currentNickname,
  onUpdate,
}: {
  currentNickname: string;
  onUpdate: (user: User) => void;
}) {
  const [nickname, setNickname] = useState(currentNickname);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const submit = async () => {
    setMessage(null);
    if (nickname === currentNickname) {
      setMessage({ type: "error", text: "변경된 내용이 없습니다." });
      return;
    }
    if (!nickname || nickname.length > 15) {
      setMessage({ type: "error", text: "별명은 1~15자 이내여야 합니다." });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/nickname", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "닉네임 변경 실패" });
        return;
      }
      onUpdate(data.user);
      setMessage({ type: "success", text: "닉네임이 변경되었습니다." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-5 mb-4">
      <h2 className="text-base font-semibold mb-3">닉네임</h2>
      <div className="space-y-3">
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={15}
          className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm outline-none focus:border-dunggeure-primary transition"
          placeholder="새 닉네임 (15자 이내)"
        />
        {message && (
          <p
            className={`text-xs ${message.type === "success" ? "text-green-600" : "text-red-600"}`}
          >
            {message.text}
          </p>
        )}
        <button
          onClick={submit}
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-dunggeure-primary text-white text-sm font-medium hover:bg-dunggeure-dark disabled:opacity-50 transition"
        >
          {loading ? "변경 중..." : "닉네임 변경"}
        </button>
      </div>
    </section>
  );
}

function AdminPasswordSection({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);

  const submit = async () => {
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("새 비밀번호가 일치하지 않습니다.");
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
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "비밀번호 변경 실패");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccessOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-5">
      <h2 className="text-base font-semibold mb-3">관리자 비밀번호</h2>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (loading || !currentPassword || !newPassword || !confirmPassword) {
            return;
          }
          submit();
        }}
      >
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="현재 비밀번호"
          className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm outline-none focus:border-dunggeure-primary transition"
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="새 비밀번호 (8자 이상)"
          className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm outline-none focus:border-dunggeure-primary transition"
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="새 비밀번호 확인"
          className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm outline-none focus:border-dunggeure-primary transition"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={
            loading || !currentPassword || !newPassword || !confirmPassword
          }
          className="w-full py-2.5 rounded-xl bg-dunggeure-primary text-white text-sm font-medium hover:bg-dunggeure-dark disabled:opacity-50 transition"
        >
          {loading ? "변경 중..." : "비밀번호 변경"}
        </button>
      </form>

      <AppDialog
        open={successOpen}
        title="비밀번호 변경 완료"
        description="비밀번호가 안전하게 변경되었습니다."
        confirmText="확인"
        onConfirm={() => {
          setSuccessOpen(false);
          router.push(redirectTo);
        }}
        onClose={() => {
          setSuccessOpen(false);
          router.push(redirectTo);
        }}
      />
    </section>
  );
}
