"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type TopToastTone = "info" | "success" | "error";

export function TopToast({
  message,
  tone = "info",
}: {
  message: string;
  tone?: TopToastTone;
}) {
  const [visibleMessage, setVisibleMessage] = useState("");
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (message) {
      setVisibleMessage(message);
      setLeaving(false);
      return;
    }
    if (!visibleMessage) return;

    setLeaving(true);
    const timer = window.setTimeout(() => {
      setVisibleMessage("");
      setLeaving(false);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [message, visibleMessage]);

  if (!visibleMessage) return null;

  const toneClass =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-600"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-dunggeure-light bg-dunggeure-primary/10 text-dunggeure-dark";

  return createPortal(
    <>
      <style>{`
        @keyframes appToastDown {
          from { opacity: 0; transform: translateY(-14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes appToastUp {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(-14px); }
        }
      `}</style>
      <div
        className="pointer-events-none fixed left-1/2 top-4 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 font-hakgyoansimnadeuri"
        style={{ zIndex: 9999 }}
      >
        <div
          className={`rounded-xl border px-4 py-3 text-center text-sm font-bold shadow-xl ${toneClass}`}
          style={{
            animation: `${leaving ? "appToastUp" : "appToastDown"} 180ms ease-out both`,
          }}
          role="status"
          aria-live="polite"
        >
          {visibleMessage}
        </div>
      </div>
    </>,
    document.body,
  );
}
