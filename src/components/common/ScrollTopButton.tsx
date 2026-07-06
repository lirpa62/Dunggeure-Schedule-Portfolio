"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export function ScrollTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > 360);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-dunggeure-light bg-[var(--card)] text-dunggeure-primary shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:bg-dunggeure-lighter/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-dunggeure-primary sm:bottom-6 sm:right-6 ${
        visible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-3 opacity-0"
      }`}
      aria-label="최상단으로 이동"
    >
      <ArrowUp size={20} />
    </button>
  );
}
