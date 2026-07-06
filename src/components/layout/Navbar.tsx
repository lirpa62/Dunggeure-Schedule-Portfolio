"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  ChevronDown,
  LogIn,
  LogOut,
  Moon,
  Settings,
  Sun,
} from "lucide-react";
import { AdminLoginForm } from "@/components/auth/AdminLoginForm";
import { useAuthStore, useThemeStore } from "@/stores";
import type { User } from "@/types";

function ProfileAvatar({
  user,
  size = "sm",
}: {
  user: User;
  size?: "sm" | "md";
}) {
  const sizeClass = size === "md" ? "h-9 w-9" : "h-6 w-6";
  const textClass = size === "md" ? "text-sm" : "text-xs";
  const src = user.avatar_url || "";

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={`${sizeClass} rounded-full object-cover ring-1 ring-dunggeure-light/60`}
      />
    );
  }

  return (
    <span
      className={`flex ${sizeClass} items-center justify-center rounded-full bg-dunggeure-primary/10 ${textClass} font-bold text-dunggeure-primary ring-1 ring-dunggeure-light/60`}
    >
      {user.nickname.slice(0, 1)}
    </span>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const loginRef = useRef<HTMLDivElement | null>(null);
  const { theme, toggleTheme } = useThemeStore();
  const { user, isAdmin, hydrated, logout } = useAuthStore();
  const loginReturnTo = pathname || "/schedule";
  const settingsHref =
    pathname && pathname !== "/settings"
      ? `/settings?returnTo=${encodeURIComponent(pathname)}`
      : "/settings";

  useEffect(() => {
    setProfileOpen(false);
    setLoginOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!profileOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (profileRef.current?.contains(target)) return;
      setProfileOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [profileOpen]);

  useEffect(() => {
    if (!loginOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (loginRef.current?.contains(target)) return;
      setLoginOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLoginOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [loginOpen]);

  return (
    <nav className="font-hakgyoansimnadeuri sticky top-0 z-50 border-b border-[var(--border)] bg-dunggeure-lighter/20 backdrop-blur-md dark:bg-dunggeure-primary/10">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between pr-4">
        <Link
          href="/schedule"
          className="group flex h-full items-center gap-2 text-xl font-bold text-dunggeure-primary transition hover:opacity-80"
        >
          <img
            src="/nav_dung.png"
            alt=""
            aria-hidden="true"
            className="ml-1 h-12 w-auto self-end object-contain object-bottom scale-x-[-1] transition group-hover:translate-y-0.5"
          />
          <CalendarDays size={20} />
          <span>둥그레 일정표</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-lg p-2 transition hover:bg-dunggeure-lighter/30"
            aria-label="테마 전환"
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          {!hydrated ? (
            <div
              className="h-9 w-[4.5rem] rounded-lg bg-dunggeure-lighter/40"
              aria-hidden="true"
            />
          ) : user ? (
            <div ref={profileRef} className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                className="hidden items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-dunggeure-lighter/30 hover:text-dunggeure-primary sm:inline-flex"
                aria-label="프로필 메뉴"
                aria-expanded={profileOpen}
              >
                <ProfileAvatar user={user} />
                <span>{user.nickname}</span>
                <ChevronDown
                  size={14}
                  className={`transition-transform ${profileOpen ? "rotate-180" : ""}`}
                />
              </button>
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                className="inline-flex rounded-lg p-1.5 transition hover:bg-dunggeure-lighter/30 sm:hidden"
                aria-label="프로필 메뉴"
                aria-expanded={profileOpen}
              >
                <ProfileAvatar user={user} />
              </button>

              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                    className="absolute right-0 top-full z-[80] mt-2 w-56 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl"
                  >
                    <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
                      <ProfileAvatar user={user} size="md" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-dunggeure-dark">
                          {user.nickname}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {isAdmin ? "관리자" : "일반 유저"}
                        </p>
                      </div>
                    </div>
                    <Link
                      href={settingsHref}
                      className="flex items-center gap-2 px-4 py-3 text-sm text-[var(--text)] transition hover:bg-dunggeure-primary/10"
                    >
                      <Settings size={15} />
                      설정
                    </Link>
                    <button
                      type="button"
                      onClick={logout}
                      className="flex w-full items-center gap-2 border-t border-[var(--border)] px-4 py-3 text-left text-sm text-red-500 transition hover:bg-red-50"
                    >
                      <LogOut size={15} />
                      로그아웃
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div ref={loginRef} className="relative">
              <button
                type="button"
                onClick={() => setLoginOpen((open) => !open)}
                aria-expanded={loginOpen}
                className="flex items-center justify-center gap-1 rounded-lg border border-dunggeure-tertiary/20 bg-dunggeure-tertiary/5 p-2 text-sm text-dunggeure-tertiary transition hover:border-dunggeure-tertiary/30 hover:bg-dunggeure-tertiary/10 sm:px-3 sm:py-1.5"
              >
                <LogIn size={18} className="sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">로그인</span>
              </button>

              <AnimatePresence>
                {loginOpen && (
                  <motion.div
                    role="dialog"
                    aria-label="관리자 로그인"
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute right-0 top-full z-[80] mt-2 w-80 origin-top-right rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl"
                  >
                    <AdminLoginForm
                      returnTo={loginReturnTo}
                      onSuccess={() => setLoginOpen(false)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
