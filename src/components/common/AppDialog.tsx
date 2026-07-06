"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type AppDialogVariant = "default" | "danger";

type AppDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: AppDialogVariant;
  busy?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
};

export function AppDialog({
  open,
  title,
  description,
  children,
  confirmText = "확인",
  cancelText,
  variant = "default",
  busy = false,
  onConfirm,
  onClose,
}: AppDialogProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose, open]);

  if (!mounted || !open) return null;

  const confirmClass =
    variant === "danger"
      ? "bg-red-500 text-white hover:bg-red-600"
      : "bg-dunggeure-primary text-white hover:bg-dunggeure-dark";

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        event.stopPropagation();
        if (!busy) onClose();
      }}
      onClick={(event) => event.stopPropagation()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-dunggeure-light/70 bg-[var(--card)] font-hakgyoansimnadeuri shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2
            id="app-dialog-title"
            className="text-lg font-bold text-dunggeure-dark"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1 text-[var(--text)] transition hover:bg-dunggeure-lighter/30 disabled:opacity-40"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-5">
          {description && (
            <p className="whitespace-pre-wrap text-base leading-relaxed text-[var(--text)]">
              {description}
            </p>
          )}
          {children}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
          {cancelText && (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="inline-flex min-w-20 items-center justify-center whitespace-nowrap rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-bold transition hover:bg-dunggeure-lighter/30 disabled:opacity-40"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm || onClose}
            disabled={busy}
            className={`inline-flex min-w-24 items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold transition disabled:opacity-40 ${confirmClass}`}
          >
            {busy ? "처리 중..." : confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
