"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

type TooltipProps = {
  content: string;
  children: ReactElement;
  delay?: number;
};

export function Tooltip({ content, children, delay = 250 }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const showTimer = useRef<number | null>(null);

  const canHover = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  useEffect(() => {
    return () => {
      if (showTimer.current) window.clearTimeout(showTimer.current);
    };
  }, []);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      left: rect.left + rect.width / 2,
      top: rect.top - 8,
    });
  };

  const show = () => {
    if (!canHover()) return;
    if (showTimer.current) window.clearTimeout(showTimer.current);
    showTimer.current = window.setTimeout(() => {
      updatePosition();
      setOpen(true);
    }, delay);
  };

  const hide = () => {
    if (showTimer.current) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    setOpen(false);
  };

  // children에 ref + 이벤트 핸들러 주입
  const trigger = (() => {
    const child = children;
    type ChildProps = {
      onMouseEnter?: (e: React.MouseEvent) => void;
      onMouseLeave?: (e: React.MouseEvent) => void;
      onFocus?: (e: React.FocusEvent) => void;
      onBlur?: (e: React.FocusEvent) => void;
      onClick?: (e: React.MouseEvent) => void;
      onTouchStart?: (e: React.TouchEvent) => void;
      ref?: React.Ref<HTMLElement>;
    };
    const childProps = (child.props ?? {}) as ChildProps;
    const existingRef = childProps.ref;
    const setRef = (node: HTMLElement | null) => {
      triggerRef.current = node;
      if (typeof existingRef === "function") existingRef(node);
      else if (existingRef && typeof existingRef === "object") {
        (existingRef as React.MutableRefObject<HTMLElement | null>).current =
          node;
      }
    };
    return {
      ...child,
      props: {
        ...childProps,
        ref: setRef,
        onMouseEnter: (e: React.MouseEvent) => {
          childProps.onMouseEnter?.(e);
          show();
        },
        onMouseLeave: (e: React.MouseEvent) => {
          childProps.onMouseLeave?.(e);
          hide();
        },
        onFocus: (e: React.FocusEvent) => {
          childProps.onFocus?.(e);
          if (!canHover()) return;
          updatePosition();
          setOpen(true);
        },
        onBlur: (e: React.FocusEvent) => {
          childProps.onBlur?.(e);
          hide();
        },
        onClick: (e: React.MouseEvent) => {
          childProps.onClick?.(e);
          hide();
        },
        onTouchStart: (e: React.TouchEvent) => {
          childProps.onTouchStart?.(e);
          hide();
        },
      },
    } as ReactElement;
  })();

  return (
    <>
      {trigger}
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[200] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-dunggeure-dark/95 px-2.5 py-1 text-xs text-white shadow-lg backdrop-blur-sm"
            style={{ left: pos.left, top: pos.top }}
          >
            {content}
            <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-dunggeure-dark/95" />
          </div>,
          document.body,
        )}
    </>
  );
}
