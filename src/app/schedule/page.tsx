"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { RgbaColorPicker } from "react-colorful";
import { AppDialog } from "@/components/common/AppDialog";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
  UIEvent as ReactUIEvent,
} from "react";
import { Navbar } from "@/components/layout/Navbar";
import { createClient } from "@/lib/supabase";
import {
  getHolidayName,
  isCustomHoliday,
  loadHolidaysForYear,
  subscribeHolidays,
} from "@/lib/holidays";
import {
  useAuthStore,
  useScheduleMediaCacheStore,
  useStickerCacheStore,
} from "@/stores";
import { DAY_COLORS, STICKER_CATEGORIES } from "@/types";
import type {
  Schedule,
  ScheduleTag,
  Sticker,
  StickerCategory,
  StickerCategoryOption,
  CalendarDecoration,
  MonthlyNotice,
  NoticeTemplate,
  ScheduleRichTextSegment,
  ScheduleRichTextStyle,
} from "@/types";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  Minus,
  X,
  Edit2,
  Trash2,
  Check,
  CalendarDays,
  ChevronDown,
  Clock,
  LocateFixed,
  RotateCcw,
  GripVertical,
  Star,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addDays,
  addMonths,
  subDays,
  subMonths,
} from "date-fns";
import { ko } from "date-fns/locale";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";

const DAY_HEADERS = ["일", "월", "화", "수", "목", "금", "토"];
const DAY_HEADER_COLORS = [
  DAY_COLORS.sunday,
  DAY_COLORS.monday,
  DAY_COLORS.tuesday,
  DAY_COLORS.wednesday,
  DAY_COLORS.thursday,
  DAY_COLORS.friday,
  DAY_COLORS.saturday,
];

// 셀 안 날짜 헤더 배경색 (톤다운된 일/평일/토)
const DAY_HEADER_BG_COLORS = [
  "#c98fa7",
  "#d0cdec",
  "#d0cdec",
  "#d0cdec",
  "#d0cdec",
  "#d0cdec",
  "#c4c4ff",
];
const DAY_HEADER_TEXT_COLORS = [
  "#fff8fb",
  "#7e78b8",
  "#7e78b8",
  "#7e78b8",
  "#7e78b8",
  "#7e78b8",
  "#5f5fff",
];

// 시간 표기 정규화: 입력 문자열을 한글 표기("오전 10시", "오후 2시 30분")로 통일.
// 파싱 실패하면 공백만 정리한 원본을 돌려줌(자유 입력 호환).
function normalizeTime(raw: string | null | undefined): string {
  if (!raw) return "";
  const parsed = parseTimeValue(raw);
  if (parsed) return formatTimeKorean(parsed);
  return raw.replace(/\s+/g, " ").trim();
}

type TimePeriod = "AM" | "PM";

type ParsedTime = {
  period: TimePeriod;
  hour: number; // 1~12
  minute: number; // 0~59
};

// "7PM", "1:30 AM", "오전 10시", "오후 2시 30분", "오후 2:30" 등 다양한 형식을 파싱.
function parseTimeValue(raw: string | null | undefined): ParsedTime | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  // 한글 표기: "오전/오후 H시 [M분]" 또는 "오전/오후 H[:M]"
  const kr = value.match(
    /^(오전|오후)\s*(\d{1,2})\s*(?:시(?:\s*(\d{1,2})\s*분)?|:\s*(\d{1,2}))?\s*$/,
  );
  if (kr) {
    const period: TimePeriod = kr[1] === "오전" ? "AM" : "PM";
    const hour = parseInt(kr[2], 10);
    const minute = parseInt(kr[3] ?? kr[4] ?? "0", 10);
    if (hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59) {
      return { period, hour, minute };
    }
    return null;
  }

  // AM/PM 표기: "7PM", "10:30AM", "1 : 30 am"
  const en = value
    .replace(/\s+/g, "")
    .toUpperCase()
    .match(/^(\d{1,2})(?::(\d{1,2}))?(AM|PM)$/);
  if (en) {
    const hour = parseInt(en[1], 10);
    const minute = en[2] ? parseInt(en[2], 10) : 0;
    const period = en[3] as TimePeriod;
    if (hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59) {
      return { period, hour, minute };
    }
  }

  return null;
}

function formatTimeKorean(parsed: ParsedTime): string {
  const periodLabel = parsed.period === "AM" ? "오전" : "오후";
  if (parsed.minute === 0) return `${periodLabel} ${parsed.hour}시`;
  return `${periodLabel} ${parsed.hour}시 ${parsed.minute}분`;
}

function normalizeCollabMembersInput(raw: string): string {
  return raw.replace(/^\s*w\.\s*/i, "");
}

function displayTime(raw: string | null | undefined): string {
  const value = raw?.trim() || "";
  if (!value) return "";
  const parsed = parseTimeValue(value);
  return parsed ? formatTimeKorean(parsed) : value;
}

function displayCompactTime(raw: string | null | undefined): string {
  const value = raw?.trim() || "";
  if (!value) return "";
  const parsed = parseTimeValue(value);
  if (!parsed) return value;
  const periodLabel = parsed.period === "AM" ? "오전" : "오후";
  const timeLabel =
    parsed.minute === 0
      ? `${parsed.hour}시`
      : `${parsed.hour}시 ${parsed.minute}분`;
  return `${periodLabel}\n${timeLabel}`;
}

let bodyScrollLockCount = 0;
let previousBodyOverflow = "";

function lockBodyScroll() {
  if (bodyScrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  bodyScrollLockCount += 1;

  return () => {
    bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
    if (bodyScrollLockCount === 0) {
      document.body.style.overflow = previousBodyOverflow;
      previousBodyOverflow = "";
    }
  };
}

// "10" → {hour:10, minute:0}, "10:30" → {hour:10, minute:30}, "1030" → {hour:10, minute:30}
function parseHourMinuteInput(
  raw: string,
): { hour: number; minute: number } | null {
  const value = raw.replace(/\s+/g, "");
  if (!value) return null;
  const m = value.match(/^(\d{1,2})(?::?(\d{1,2}))?$/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  if (hour < 1 || hour > 12) return null;
  if (minute < 0 || minute > 59) return null;
  return { hour, minute };
}

// 오전/오후 select + 시(1~12) 숫자 입력. 콜론으로 분도 함께 입력 가능 (예: 10:30).
// value/onChange 는 한글 포맷 문자열 ("오전 10시", "오후 2시 30분", "")로 통신.
function KoreanTimeInput({
  value,
  onChange,
  inputRef,
  inputStyle,
  inputClassName,
  inputAutoFocus = false,
  onInputKeyDown,
  onInputFocus,
  placeholder = "예: 10 또는 2:30",
}: {
  value: string;
  onChange: (next: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  inputStyle?: React.CSSProperties;
  inputClassName?: string;
  inputAutoFocus?: boolean;
  onInputKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onInputFocus?: () => void;
  placeholder?: string;
}) {
  const parsedValue = parseTimeValue(value);
  const [period, setPeriod] = useState<TimePeriod>(parsedValue?.period ?? "AM");
  const [hourText, setHourText] = useState<string>(() => {
    if (!parsedValue) return "";
    return parsedValue.minute === 0
      ? String(parsedValue.hour)
      : `${parsedValue.hour}:${String(parsedValue.minute).padStart(2, "0")}`;
  });
  const [periodOpen, setPeriodOpen] = useState(false);
  const periodWrapperRef = useRef<HTMLDivElement | null>(null);

  // 외부에서 value가 바뀌면 내부 입력값도 동기화 (편집 시작/리셋 등)
  const lastEmittedRef = useRef<string>(value);
  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    const parsed = parseTimeValue(value);
    if (parsed) {
      setPeriod(parsed.period);
      setHourText(
        parsed.minute === 0
          ? String(parsed.hour)
          : `${parsed.hour}:${String(parsed.minute).padStart(2, "0")}`,
      );
    } else if (!value) {
      setHourText("");
    }
  }, [value]);

  useEffect(() => {
    if (!periodOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (periodWrapperRef.current?.contains(target)) return;
      setPeriodOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [periodOpen]);

  const emit = (nextPeriod: TimePeriod, nextHourText: string) => {
    const text = nextHourText.trim();
    if (!text) {
      lastEmittedRef.current = "";
      onChange("");
      return;
    }
    const parsed = parseHourMinuteInput(text);
    if (!parsed) {
      lastEmittedRef.current = text;
      onChange(text);
      return;
    }
    const formatted = formatTimeKorean({
      period: nextPeriod,
      hour: parsed.hour,
      minute: parsed.minute,
    });
    lastEmittedRef.current = formatted;
    onChange(formatted);
  };

  const handlePeriodSelect = (next: TimePeriod) => {
    setPeriod(next);
    setPeriodOpen(false);
    emit(next, hourText);
  };

  const handleHourChange = (raw: string) => {
    const sanitized = raw.replace(/[^0-9:]/g, "").slice(0, 5);
    setHourText(sanitized);
    emit(period, sanitized);
  };

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <div ref={periodWrapperRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setPeriodOpen((open) => !open)}
          aria-expanded={periodOpen}
          aria-haspopup="listbox"
          className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 text-sm transition hover:border-dunggeure-light focus:border-dunggeure-primary focus:outline-none"
        >
          <span>{period === "AM" ? "오전" : "오후"}</span>
          <ChevronDown
            size={13}
            className={`transition-transform ${periodOpen ? "rotate-180" : ""}`}
          />
        </button>
        <AnimatePresence>
          {periodOpen && (
            <motion.ul
              role="listbox"
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
              className="absolute left-0 top-full z-30 mt-1 w-[5.5rem] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-xl"
            >
              {(["AM", "PM"] as const).map((opt) => (
                <li key={opt}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={period === opt}
                    onClick={() => handlePeriodSelect(opt)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-sm transition hover:bg-dunggeure-lighter/30 ${
                      period === opt
                        ? "font-bold text-dunggeure-primary"
                        : "text-[var(--text)]"
                    }`}
                  >
                    <span>{opt === "AM" ? "오전" : "오후"}</span>
                    {period === opt && <Check size={12} strokeWidth={3} />}
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoFocus={inputAutoFocus}
        value={hourText}
        onChange={(e) => handleHourChange(e.target.value)}
        onKeyDown={onInputKeyDown}
        onFocus={onInputFocus}
        placeholder={placeholder}
        className={
          inputClassName ??
          "w-full min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none transition focus:border-dunggeure-primary"
        }
        style={inputStyle}
      />
    </div>
  );
}

function getScheduleDisplayTime(schedule: Schedule): string {
  const baseTime = displayTime(schedule.time);
  const timeNote = schedule.meta?.time_note?.trim() || "";
  if (!timeNote) return baseTime;
  if (!baseTime) return timeNote;

  const position = schedule.meta?.time_note_position ?? "before";
  const gap = schedule.meta?.time_note_gap ?? 1;
  const separator = "\n".repeat(gap);
  return position === "before"
    ? `${timeNote}${separator}${baseTime}`
    : `${baseTime}${separator}${timeNote}`;
}

function getScheduleCompactDisplayTime(schedule: Schedule): string {
  const baseTime = displayCompactTime(schedule.time);
  const timeNote = displayCompactTime(schedule.meta?.time_note);
  if (!timeNote) return baseTime;
  if (!baseTime) return timeNote;

  const position = schedule.meta?.time_note_position ?? "before";
  const gap = schedule.meta?.time_note_gap ?? 1;
  const separator = "\n".repeat(gap);
  return position === "before"
    ? `${timeNote}${separator}${baseTime}`
    : `${baseTime}${separator}${timeNote}`;
}

// ===== 색 + 투명도 헬퍼 =====
// DB에는 #rrggbb / #rrggbbaa / rgba(r,g,b,a) 등이 섞여 있을 수 있어 모두 받아들임.
// UI 입력은 hex(#rrggbb) + alpha(0~1) 로 분리해서 다룸.
function parseColor(input: string | null | undefined): {
  hex: string;
  alpha: number;
} {
  if (!input) return { hex: "#ffffff", alpha: 1 };
  const v = input.trim();
  // rgba(r, g, b, a)
  const m = v.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/i,
  );
  if (m) {
    const [r, g, b] = [+m[1], +m[2], +m[3]];
    const a = m[4] !== undefined ? Math.max(0, Math.min(1, +m[4])) : 1;
    const toHex = (n: number) => n.toString(16).padStart(2, "0");
    return { hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`, alpha: a };
  }
  // #rrggbbaa
  if (/^#[0-9a-f]{8}$/i.test(v)) {
    const a = parseInt(v.slice(7, 9), 16) / 255;
    return { hex: v.slice(0, 7).toLowerCase(), alpha: a };
  }
  // #rrggbb
  if (/^#[0-9a-f]{6}$/i.test(v)) {
    return { hex: v.toLowerCase(), alpha: 1 };
  }
  // #rgb
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    const r = v[1],
      g = v[2],
      b = v[3];
    return { hex: `#${r}${r}${g}${g}${b}${b}`.toLowerCase(), alpha: 1 };
  }
  return { hex: "#ffffff", alpha: 1 };
}

// hex(#rrggbb) + alpha → RgbaColorPicker가 쓰는 { r, g, b, a } 객체
function hexAlphaToRgba(hex: string, alpha: number) {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return { r: 255, g: 255, b: 255, a: alpha };
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
    a: alpha,
  };
}

// RgbaColorPicker가 돌려준 { r, g, b, a } → hex + alpha
function rgbaToHexAlpha(rgba: { r: number; g: number; b: number; a: number }) {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return {
    hex: `#${toHex(rgba.r)}${toHex(rgba.g)}${toHex(rgba.b)}`,
    alpha: Math.max(0, Math.min(1, rgba.a)),
  };
}

function combineColor(hex: string, alpha: number): string {
  if (alpha >= 0.999) return hex;
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return hex;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}

function normalizeHexInput(value: string): string | null {
  const compact = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(compact)) {
    const r = compact.charAt(0);
    const g = compact.charAt(1);
    const b = compact.charAt(2);
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^[0-9a-f]{6}$/i.test(compact)) {
    return `#${compact}`.toLowerCase();
  }
  return null;
}

type ScheduleContentStyle = NonNullable<Schedule["meta"]["content_style"]>;
type ScheduleTimeStyle = NonNullable<Schedule["meta"]["time_style"]>;
type ScheduleTextStyle = ScheduleContentStyle | ScheduleTimeStyle;
type TextSelectionRange = { start: number; end: number };
type ScheduleTagBorderStyle = NonNullable<ScheduleTag["border_style"]>;

function getBaseScheduleContentColors(tag?: ScheduleTag) {
  return {
    bg: tag?.bg_color ? parseColor(tag.bg_color) : { hex: "#ffffff", alpha: 0 },
    fg: parseColor(tag?.font_color || "#333333"),
  };
}

function getScheduleContentStyle(meta: Schedule["meta"] | null | undefined) {
  const raw = meta?.content_style;
  if (!raw || typeof raw !== "object") return null;
  return raw as ScheduleContentStyle;
}

function getScheduleTimeStyle(meta: Schedule["meta"] | null | undefined) {
  const raw = meta?.time_style;
  if (!raw || typeof raw !== "object") return null;
  return raw as ScheduleTimeStyle;
}

function getTextStyleTextDecoration(style: ScheduleTextStyle) {
  return [
    style.is_underline && "underline",
    style.is_strikethrough && "line-through",
  ]
    .filter(Boolean)
    .join(" ");
}

const RESPONSIVE_FONT_MIN_VIEWPORT = 360;
const RESPONSIVE_FONT_MAX_VIEWPORT = 768;

function buildResponsiveFontSize(
  value: number,
  minSize: number,
  maxSize: number,
) {
  const size = Math.max(minSize, Math.min(maxSize, value));
  const mobileSize = Math.max(minSize, Math.min(size, Math.round(size * 0.72)));
  if (mobileSize >= size) return `${size}px`;

  const slope =
    ((size - mobileSize) /
      (RESPONSIVE_FONT_MAX_VIEWPORT - RESPONSIVE_FONT_MIN_VIEWPORT)) *
    100;
  const intercept = mobileSize - (slope * RESPONSIVE_FONT_MIN_VIEWPORT) / 100;

  return `clamp(${mobileSize}px, calc(${slope.toFixed(4)}vw + ${intercept.toFixed(4)}px), ${size}px)`;
}

function buildScheduleContentStyle(style: ScheduleContentStyle | null) {
  if (!style) return {};
  const result: CSSProperties = {};
  if (style.bg_color) result.backgroundColor = style.bg_color;
  if (style.font_color) result.color = style.font_color;
  if (style.font_weight) result.fontWeight = style.font_weight;
  result.fontStyle = style.is_italic ? "italic" : "normal";
  const textDecoration = getTextStyleTextDecoration(style);
  result.textDecoration = textDecoration || "none";
  if (typeof style.font_size === "number" && Number.isFinite(style.font_size)) {
    result.fontSize = buildResponsiveFontSize(style.font_size, 8, 28);
  }
  if (
    style.text_align === "left" ||
    style.text_align === "center" ||
    style.text_align === "right"
  ) {
    result.textAlign = style.text_align;
  }
  return result;
}

const DEFAULT_DECORATION_TEXT_STYLE: ScheduleContentStyle = {
  font_weight: "bold",
  font_size: 16,
  font_color: "rgba(154, 148, 208, 1)",
  bg_color: "rgba(240, 240, 255, 0.85)",
  text_align: "center",
};

function getDecorationCaptionStyle(decoration: CalendarDecoration) {
  const raw = decoration.caption_style;
  if (!raw || typeof raw !== "object") return DEFAULT_DECORATION_TEXT_STYLE;
  return {
    ...DEFAULT_DECORATION_TEXT_STYLE,
    ...raw,
  } as ScheduleContentStyle;
}

function getDecorationCaptionRichSegments(decoration: CalendarDecoration) {
  return normalizeRichTextSegments(decoration.caption_rich, decoration.caption);
}

function buildScheduleTagStyle(tag: ScheduleTag) {
  const result: CSSProperties = {
    backgroundColor: tag.bg_color,
    color: tag.font_color,
    fontWeight: tag.font_weight,
    fontStyle: tag.is_italic ? "italic" : "normal",
    textDecoration:
      [tag.is_underline && "underline", tag.is_strikethrough && "line-through"]
        .filter(Boolean)
        .join(" ") || "none",
  };
  if (tag.border_style && tag.border_style !== "none") {
    result.borderColor = tag.border_color || "#8080ff";
    result.borderStyle = tag.border_style;
    result.borderWidth = "1px";
  }
  if (typeof tag.font_size === "number" && Number.isFinite(tag.font_size)) {
    result.fontSize = `${Math.max(8, Math.min(28, tag.font_size))}px`;
  }
  if (
    tag.text_align === "left" ||
    tag.text_align === "center" ||
    tag.text_align === "right"
  ) {
    result.textAlign = tag.text_align;
  }
  return result;
}

function buildScheduleTagBorderStyle(
  tag: ScheduleTag | null | undefined,
): CSSProperties {
  if (!tag?.border_style || tag.border_style === "none") return {};
  return {
    borderColor: tag.border_color || "#8080ff",
    borderStyle: tag.border_style,
    borderWidth: "1px",
  };
}

function getScheduleTagTint(
  tag: ScheduleTag | null | undefined,
  alpha: number,
) {
  if (!tag?.bg_color) return undefined;
  const parsed = parseColor(tag.bg_color);
  return combineColor(parsed.hex, Math.min(parsed.alpha, alpha));
}

function getScheduleContentRichSegments(
  schedule: Pick<Schedule, "content" | "meta">,
) {
  return normalizeRichTextSegments(
    schedule.meta?.content_rich,
    schedule.content,
  );
}

function hasRichTextStyle(segment: ScheduleRichTextSegment) {
  const style = segment.style;
  if (!style) return false;
  return Object.values(style).some((value) => value !== undefined);
}

function hasAnyRichTextStyle(segments: ScheduleRichTextSegment[]) {
  return segments.some(hasRichTextStyle);
}

function normalizeRichTextSegments(
  raw: unknown,
  fallbackText: string | null | undefined,
): ScheduleRichTextSegment[] {
  const text = fallbackText || "";
  if (!text) return [];
  if (!Array.isArray(raw)) return [{ text }];
  const segments = raw
    .map((segment) => {
      if (!segment || typeof segment !== "object") return null;
      const source = segment as {
        text?: unknown;
        style?: unknown;
      };
      if (typeof source.text !== "string" || !source.text) return null;
      const styleSource =
        source.style && typeof source.style === "object"
          ? (source.style as Record<string, unknown>)
          : {};
      const style: ScheduleRichTextStyle = {};
      if (
        styleSource.font_weight === "normal" ||
        styleSource.font_weight === "bold"
      ) {
        style.font_weight = styleSource.font_weight;
      }
      if (typeof styleSource.is_italic === "boolean") {
        style.is_italic = styleSource.is_italic;
      }
      if (typeof styleSource.is_underline === "boolean") {
        style.is_underline = styleSource.is_underline;
      }
      if (typeof styleSource.is_strikethrough === "boolean") {
        style.is_strikethrough = styleSource.is_strikethrough;
      }
      if (
        typeof styleSource.font_size === "number" &&
        Number.isFinite(styleSource.font_size)
      ) {
        style.font_size = Math.max(8, Math.min(28, styleSource.font_size));
      }
      if (typeof styleSource.font_color === "string") {
        style.font_color = styleSource.font_color;
      }
      if (typeof styleSource.bg_color === "string") {
        style.bg_color = styleSource.bg_color;
      }
      return {
        text: source.text,
        style: Object.keys(style).length ? style : undefined,
      };
    })
    .filter(Boolean) as ScheduleRichTextSegment[];
  if (!segments.length) return [{ text }];
  if (segments.map((segment) => segment.text).join("") !== text) {
    return [{ text }];
  }
  return mergeRichTextSegments(segments);
}

function mergeRichTextSegments(segments: ScheduleRichTextSegment[]) {
  const result: ScheduleRichTextSegment[] = [];
  segments.forEach((segment) => {
    if (!segment.text) return;
    const normalized = hasRichTextStyle(segment)
      ? { text: segment.text, style: segment.style }
      : { text: segment.text };
    const prev = result[result.length - 1];
    if (
      prev &&
      JSON.stringify(prev.style || {}) ===
        JSON.stringify(normalized.style || {})
    ) {
      prev.text += normalized.text;
      return;
    }
    result.push(normalized);
  });
  return result;
}

function reconcileRichTextSegmentsForText(
  segments: ScheduleRichTextSegment[],
  previousText: string,
  nextText: string,
) {
  const normalized = normalizeRichTextSegments(segments, previousText);
  if (!nextText) return [];
  if (nextText === previousText) return normalized;
  if (nextText.startsWith(previousText)) {
    const added = nextText.slice(previousText.length);
    return mergeRichTextSegments([...normalized, { text: added }]);
  }
  if (previousText.startsWith(nextText)) {
    let remaining = nextText.length;
    const nextSegments: ScheduleRichTextSegment[] = [];
    normalized.forEach((segment) => {
      if (remaining <= 0) return;
      const take = Math.min(segment.text.length, remaining);
      nextSegments.push({
        text: segment.text.slice(0, take),
        style: segment.style,
      });
      remaining -= take;
    });
    return mergeRichTextSegments(nextSegments);
  }
  return [{ text: nextText }];
}

function buildRichTextSegmentStyle(style?: ScheduleRichTextStyle) {
  if (!style) return {};
  const result: CSSProperties = {};
  if (style.bg_color) result.backgroundColor = style.bg_color;
  if (style.font_color) result.color = style.font_color;
  if (style.font_weight) result.fontWeight = style.font_weight;
  if (style.is_italic !== undefined) {
    result.fontStyle = style.is_italic ? "italic" : "normal";
  }
  const textDecoration = [
    style.is_underline && "underline",
    style.is_strikethrough && "line-through",
  ]
    .filter(Boolean)
    .join(" ");
  if (textDecoration) result.textDecoration = textDecoration;
  if (typeof style.font_size === "number" && Number.isFinite(style.font_size)) {
    result.fontSize = buildResponsiveFontSize(style.font_size, 8, 28);
  }
  return result;
}

function RichTextContent({
  segments,
  fallback,
}: {
  segments: ScheduleRichTextSegment[];
  fallback: string | null | undefined;
}) {
  const normalized = normalizeRichTextSegments(segments, fallback);
  if (!normalized.length) return <>{fallback}</>;
  return (
    <>
      {normalized.map((segment, index) => (
        <span
          key={`${index}-${segment.text}`}
          style={buildRichTextSegmentStyle(segment.style)}
        >
          {segment.text}
        </span>
      ))}
    </>
  );
}

function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/gi);

  return (
    <>
      {parts.map((part, index) => {
        if (!/^https?:\/\//i.test(part)) return part;

        const match = part.match(/^(.*?)([.,!?;:)\]}]*)$/);
        const href = match?.[1] || part;
        const trailing = match?.[2] || "";

        return (
          <span key={`${index}-${part}`}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-dunggeure-primary underline underline-offset-2 hover:text-dunggeure-dark"
            >
              {href}
            </a>
            {trailing}
          </span>
        );
      })}
    </>
  );
}

function applyRichStyleToSelection(
  segments: ScheduleRichTextSegment[],
  text: string,
  range: TextSelectionRange | null,
  patch: ScheduleRichTextStyle,
) {
  if (!range || range.start === range.end) return segments;
  const start = Math.max(0, Math.min(range.start, text.length));
  const end = Math.max(start, Math.min(range.end, text.length));
  if (start === end) return segments;

  const normalized = normalizeRichTextSegments(segments, text);
  const next: ScheduleRichTextSegment[] = [];
  let offset = 0;
  normalized.forEach((segment) => {
    const segmentStart = offset;
    const segmentEnd = offset + segment.text.length;
    offset = segmentEnd;
    if (segmentEnd <= start || segmentStart >= end) {
      next.push(segment);
      return;
    }

    const localStart = Math.max(0, start - segmentStart);
    const localEnd = Math.min(segment.text.length, end - segmentStart);
    if (localStart > 0) {
      next.push({
        text: segment.text.slice(0, localStart),
        style: segment.style,
      });
    }
    const selectedStyle: ScheduleRichTextStyle = {
      ...(segment.style || {}),
      ...patch,
    };
    Object.keys(selectedStyle).forEach((key) => {
      const typedKey = key as keyof ScheduleRichTextStyle;
      if (selectedStyle[typedKey] === undefined) delete selectedStyle[typedKey];
    });
    next.push({
      text: segment.text.slice(localStart, localEnd),
      style: Object.keys(selectedStyle).length ? selectedStyle : undefined,
    });
    if (localEnd < segment.text.length) {
      next.push({
        text: segment.text.slice(localEnd),
        style: segment.style,
      });
    }
  });
  return mergeRichTextSegments(next);
}

function selectedRangeHasRichStyle(
  segments: ScheduleRichTextSegment[],
  text: string,
  range: TextSelectionRange | null,
  key: keyof ScheduleRichTextStyle,
  value: unknown,
) {
  if (!range || range.start === range.end) return false;
  const start = Math.max(0, Math.min(range.start, text.length));
  const end = Math.max(start, Math.min(range.end, text.length));
  if (start === end) return false;
  const normalized = normalizeRichTextSegments(segments, text);
  let offset = 0;
  let found = false;
  for (const segment of normalized) {
    const segmentStart = offset;
    const segmentEnd = offset + segment.text.length;
    offset = segmentEnd;
    if (segmentEnd <= start || segmentStart >= end) continue;
    found = true;
    if (segment.style?.[key] !== value) return false;
  }
  return found;
}

function getRichSelectionColor(
  segments: ScheduleRichTextSegment[],
  text: string,
  range: TextSelectionRange | null,
  key: "bg_color" | "font_color",
  fallback: { hex: string; alpha: number },
) {
  if (!range || range.start === range.end) return fallback;
  const start = Math.max(0, Math.min(range.start, text.length));
  const end = Math.max(start, Math.min(range.end, text.length));
  if (start === end) return fallback;

  const normalized = normalizeRichTextSegments(segments, text);
  let offset = 0;
  for (const segment of normalized) {
    const segmentStart = offset;
    const segmentEnd = offset + segment.text.length;
    offset = segmentEnd;
    if (segmentEnd <= start || segmentStart >= end) continue;
    const color = segment.style?.[key];
    if (typeof color === "string") return parseColor(color);
  }
  return fallback;
}

function getRichSelectionFontSize(
  segments: ScheduleRichTextSegment[],
  text: string,
  range: TextSelectionRange | null,
  fallback: number,
) {
  if (!range || range.start === range.end) return fallback;
  const start = Math.max(0, Math.min(range.start, text.length));
  const end = Math.max(start, Math.min(range.end, text.length));
  if (start === end) return fallback;

  const normalized = normalizeRichTextSegments(segments, text);
  let offset = 0;
  for (const segment of normalized) {
    const segmentStart = offset;
    const segmentEnd = offset + segment.text.length;
    offset = segmentEnd;
    if (segmentEnd <= start || segmentStart >= end) continue;
    const fontSize = segment.style?.font_size;
    if (typeof fontSize === "number" && Number.isFinite(fontSize)) {
      return Math.max(8, Math.min(28, fontSize));
    }
  }
  return fallback;
}

function getTextareaSelection(
  textarea: HTMLTextAreaElement | null,
): TextSelectionRange | null {
  if (!textarea) return null;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  if (typeof start !== "number" || typeof end !== "number" || start === end) {
    return null;
  }
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function buildScheduleTimeStyle(style: ScheduleTimeStyle | null) {
  if (!style) return {};
  const result: CSSProperties = {};
  if (style.bg_color) result.backgroundColor = style.bg_color;
  if (style.font_color) result.color = style.font_color;
  if (style.font_weight) result.fontWeight = style.font_weight;
  result.fontStyle = style.is_italic ? "italic" : "normal";
  const textDecoration = getTextStyleTextDecoration(style);
  result.textDecoration = textDecoration || "none";
  if (typeof style.font_size === "number" && Number.isFinite(style.font_size)) {
    result.fontSize = buildResponsiveFontSize(style.font_size, 8, 20);
  }
  if (
    style.text_align === "left" ||
    style.text_align === "center" ||
    style.text_align === "right"
  ) {
    result.textAlign = style.text_align;
  }
  return result;
}

const KOREA_TIME_ZONE = "Asia/Seoul";
const KOREA_TIME_OFFSET_MS = 9 * 60 * 60 * 1000;
const koreaDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: KOREA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getKoreaDateParts(now = new Date()) {
  const parts = koreaDateFormatter.formatToParts(now);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: getPart("year"),
    month: getPart("month"),
    day: getPart("day"),
  };
}

function getKoreaToday(now = new Date()) {
  const { year, month, day } = getKoreaDateParts(now);
  return new Date(year, month - 1, day);
}

function getMsUntilNextKoreaDay(now = new Date()) {
  const { year, month, day } = getKoreaDateParts(now);
  const nextKoreaMidnightUtc =
    Date.UTC(year, month - 1, day + 1) - KOREA_TIME_OFFSET_MS;

  return Math.max(1000, nextKoreaMidnightUtc - now.getTime() + 1000);
}

// 년도-월 선택 범위: 2024년 2월 ~ 현재
function getMonthOptions(today = getKoreaToday()) {
  const options: { year: number; month: number }[] = [];
  const now = today;
  let d = new Date(now.getFullYear(), now.getMonth());
  const firstMonth = new Date(2024, 1);
  while (d >= firstMonth) {
    options.push({ year: d.getFullYear(), month: d.getMonth() });
    d = subMonths(d, 1);
  }
  return options;
}

function getScheduleMonthKey(date: Date | string): string {
  if (typeof date === "string") return date.slice(0, 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const MONTH_MEDIA_CACHE_PREFIX = "dunggeure:schedule-month-media:";
const MONTH_MEDIA_CACHE_MAX_AGE = 10 * 60 * 1000;
const settledImageSrcs = new Set<string>();

function markImageSrcSettled(src: string) {
  if (src) settledImageSrcs.add(src);
}

type ScheduleMonthMediaCache = {
  savedAt: number;
  notice?: MonthlyNotice | null;
  decorations?: CalendarDecoration[];
};

function readScheduleMonthMediaCache(
  monthKey: string,
): ScheduleMonthMediaCache | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(
      `${MONTH_MEDIA_CACHE_PREFIX}${monthKey}`,
    );
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ScheduleMonthMediaCache;
    if (
      !parsed ||
      typeof parsed.savedAt !== "number" ||
      Date.now() - parsed.savedAt > MONTH_MEDIA_CACHE_MAX_AGE
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeScheduleMonthMediaCache(
  monthKey: string,
  patch: Omit<Partial<ScheduleMonthMediaCache>, "savedAt">,
) {
  if (typeof window === "undefined") return;

  try {
    const previous = readScheduleMonthMediaCache(monthKey) ?? { savedAt: 0 };
    window.sessionStorage.setItem(
      `${MONTH_MEDIA_CACHE_PREFIX}${monthKey}`,
      JSON.stringify({ ...previous, ...patch, savedAt: Date.now() }),
    );
  } catch {
    // Session cache is only a visual fast path; failures should not affect data.
  }
}

function getScheduleDayKey(date: Date | string): string {
  if (typeof date === "string") return date.slice(0, 10);
  return format(date, "yyyy-MM-dd");
}

function sortSchedulesForDisplay(items: Schedule[]) {
  return items
    .map((schedule, index) => ({ schedule, index }))
    .sort((a, b) => {
      const dateCompare = a.schedule.date.localeCompare(b.schedule.date);
      if (dateCompare !== 0) return dateCompare;
      if (a.schedule.sort_order !== b.schedule.sort_order) {
        return a.schedule.sort_order - b.schedule.sort_order;
      }
      return a.index - b.index;
    })
    .map(({ schedule }) => schedule);
}

function sortTagsForDisplay(items: ScheduleTag[]) {
  return items
    .map((tag, index) => ({ tag, index }))
    .sort((a, b) => {
      const aOrder =
        typeof a.tag.sort_order === "number" ? a.tag.sort_order : a.index;
      const bOrder =
        typeof b.tag.sort_order === "number" ? b.tag.sort_order : b.index;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.index - b.index;
    })
    .map(({ tag }) => tag);
}

function getScheduleDefaultTag(tags: ScheduleTag[]) {
  return tags.find((tag) => tag.is_schedule_default) || null;
}

function getMonthDirection(from: Date, to: Date): -1 | 0 | 1 {
  const diff =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth());
  if (diff > 0) return 1;
  if (diff < 0) return -1;
  return 0;
}

function getScheduleImageUrls(schedules: Schedule[]) {
  return Array.from(
    new Set(
      schedules
        .map((schedule) => schedule.image_url)
        .filter((url): url is string => Boolean(url)),
    ),
  );
}

function dateValueToDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dateToInputValue(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function formatSearchDateValue(value: string) {
  if (!value) return "전체";
  return format(dateValueToDate(value), "yyyy. M. d");
}

const calendarMonthVariants = {
  enter: (direction: -1 | 0 | 1) => ({
    x: direction === 0 ? 0 : direction > 0 ? "100%" : "-100%",
    opacity: direction === 0 ? 0 : 0.9,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: -1 | 0 | 1) => ({
    x: direction === 0 ? 0 : direction > 0 ? "-100%" : "100%",
    opacity: direction === 0 ? 0 : 0.9,
  }),
};

const dayPopupContentVariants = {
  enter: (direction: -1 | 1) => ({
    x: direction > 0 ? 36 : -36,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: -1 | 1) => ({
    x: direction > 0 ? -36 : 36,
    opacity: 0,
  }),
};

const STICKER_RECENT_STORAGE_KEY = "dunggeure-recent-stickers-v1";
const FAVORITE_STICKER_LIMIT = 7;
const RECENT_STICKER_LIMIT = 13;
const SEARCH_CACHE_LIMIT = 30;
const SEARCH_PAGE_LIMIT = 1000;
const NO_TAG_FILTER_ID = "__NO_TAG__";

type ScheduleSearchCacheEntry = {
  schedules: Schedule[];
  nextOffset: number;
  hasMore: boolean;
};

const scheduleSearchCache = new Map<string, ScheduleSearchCacheEntry>();

function getScheduleSearchCacheKey({
  query,
  selectedTags,
  startDate,
  endDate,
  sortOrder,
  offset,
}: {
  query: string;
  selectedTags: string[];
  startDate: string;
  endDate: string;
  sortOrder: "desc" | "asc";
  offset: number;
}) {
  return JSON.stringify({
    query: query.trim(),
    selectedTags: [...selectedTags].sort(),
    startDate,
    endDate,
    sortOrder,
    offset,
    limit: SEARCH_PAGE_LIMIT,
  });
}

function setScheduleSearchCache(key: string, entry: ScheduleSearchCacheEntry) {
  if (scheduleSearchCache.has(key)) {
    scheduleSearchCache.delete(key);
  }
  scheduleSearchCache.set(key, entry);

  while (scheduleSearchCache.size > SEARCH_CACHE_LIMIT) {
    const oldestKey = scheduleSearchCache.keys().next().value;
    if (!oldestKey) break;
    scheduleSearchCache.delete(oldestKey);
  }
}

export default function SchedulePage() {
  const supabase = useMemo(() => createClient(), []);
  const [todayDate, setTodayDate] = useState(() => getKoreaToday());
  const [currentDate, setCurrentDate] = useState(() => getKoreaToday());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showDayPopup, setShowDayPopup] = useState(false);
  const [isClientReady, setIsClientReady] = useState(false);
  const [searchEditScheduleId, setSearchEditScheduleId] = useState<
    string | null
  >(null);
  const [searchEditSchedule, setSearchEditSchedule] = useState<Schedule | null>(
    null,
  );
  const [searchRefreshToken, setSearchRefreshToken] = useState(0);
  const [searchHighlightScheduleId, setSearchHighlightScheduleId] = useState<
    string | null
  >(null);
  const [isSchedulesLoading, setIsSchedulesLoading] = useState(true);
  const [calendarSlideDirection, setCalendarSlideDirection] = useState<
    -1 | 0 | 1
  >(0);
  const [isCalendarDragPaused, setIsCalendarDragPaused] = useState(false);
  const [, rerenderScheduleCache] = useState(0);
  const scheduleRequestSeq = useRef(0);
  const decorationRequestSeq = useRef(0);
  const noticeRequestSeq = useRef(0);
  const scheduleCache = useRef<Map<string, Schedule[]>>(new Map());
  const decorationCache = useRef<Map<string, CalendarDecoration[]>>(new Map());
  const noticeCache = useRef<Map<string, MonthlyNotice | null>>(new Map());
  const imagePreloadCache = useRef<Map<string, Promise<void>>>(new Map());
  const initialMonthMediaHydrated = useRef(false);
  const initialTodayMonthSynced = useRef(false);
  const realtimeRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const suppressScheduleRealtimeUntil = useRef(0);
  const calendarDragPauseTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const monthPickerRef = useRef<HTMLDivElement | null>(null);
  const monthPickerListRef = useRef<HTMLDivElement | null>(null);
  const calendarSwipeRef = useRef({
    startX: 0,
    startY: 0,
    isSwiping: false,
  });
  const suppressCalendarClickRef = useRef(false);
  const { isAdmin } = useAuthStore();
  const getCachedMonthMedia = useScheduleMediaCacheStore(
    (state) => state.getMonth,
  );
  const setCachedMonthMedia = useScheduleMediaCacheStore(
    (state) => state.setMonth,
  );

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [tags, setTags] = useState<ScheduleTag[]>([]);
  const [decorations, setDecorations] = useState<CalendarDecoration[]>([]);
  const [previewDecoration, setPreviewDecoration] =
    useState<CalendarDecoration | null>(null);
  const [showDecoModal, setShowDecoModal] = useState(false);
  const [notice, setNotice] = useState<MonthlyNotice | null>(null);
  const [showNoticeModal, setShowNoticeModal] = useState(false);

  useEffect(() => {
    let midnightTimerId: number | null = null;

    const syncToday = (options?: { forceRender?: boolean }) => {
      const nextToday = getKoreaToday();
      setTodayDate((prev) =>
        options?.forceRender || !isSameDay(prev, nextToday) ? nextToday : prev,
      );
      if (!initialTodayMonthSynced.current) {
        initialTodayMonthSynced.current = true;
        setCurrentDate((prev) =>
          isSameMonth(prev, nextToday) ? prev : nextToday,
        );
      }
    };
    const scheduleNextKoreaDaySync = () => {
      if (midnightTimerId) window.clearTimeout(midnightTimerId);
      midnightTimerId = window.setTimeout(() => {
        syncToday({ forceRender: true });
        scheduleNextKoreaDaySync();
      }, getMsUntilNextKoreaDay());
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncToday({ forceRender: true });
        scheduleNextKoreaDaySync();
      }
    };
    const handlePageShow = () => {
      syncToday({ forceRender: true });
      scheduleNextKoreaDaySync();
    };

    setIsClientReady(true);
    syncToday({ forceRender: true });
    scheduleNextKoreaDaySync();
    const timerId = window.setInterval(syncToday, 60 * 1000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handlePageShow);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      if (midnightTimerId) window.clearTimeout(midnightTimerId);
      window.clearInterval(timerId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handlePageShow);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  useEffect(() => {
    if (initialMonthMediaHydrated.current) return;
    initialMonthMediaHydrated.current = true;

    const monthKey = getScheduleMonthKey(currentDate);
    const cachedMedia =
      getCachedMonthMedia(monthKey) ?? readScheduleMonthMediaCache(monthKey);
    if (!cachedMedia) return;

    if (cachedMedia.decorations) {
      decorationCache.current.set(monthKey, cachedMedia.decorations);
      setDecorations(cachedMedia.decorations);
    }

    if ("notice" in cachedMedia) {
      noticeCache.current.set(monthKey, cachedMedia.notice ?? null);
      setNotice(cachedMedia.notice ?? null);
    }
  }, [currentDate, getCachedMonthMedia]);

  const legendTags = useMemo(() => {
    const usedTagIds = new Set(
      schedules
        .filter((schedule) =>
          isSameMonth(new Date(`${schedule.date}T00:00:00`), currentDate),
        )
        .map((schedule) => schedule.tag_id)
        .filter((tagId): tagId is string => Boolean(tagId)),
    );

    if (usedTagIds.size === 0) return tags.slice(0, 3);
    return tags.filter((tag) => usedTagIds.has(tag.id));
  }, [currentDate, schedules, tags]);

  const preloadImageUrls = useCallback(
    (urls: (string | null | undefined)[]) => {
      if (typeof window === "undefined") return Promise.resolve();

      const preloadTasks = urls
        .filter((url): url is string => Boolean(url))
        .map((url) => {
          const cachedTask = imagePreloadCache.current.get(url);
          if (cachedTask) return cachedTask;

          const task = new Promise<void>((resolve) => {
            const img = new window.Image();
            img.decoding = "async";
            img.onload = () => {
              if (typeof img.decode === "function") {
                img
                  .decode()
                  .catch(() => undefined)
                  .then(() => {
                    markImageSrcSettled(url);
                    resolve();
                  });
                return;
              }
              markImageSrcSettled(url);
              resolve();
            };
            img.onerror = () => {
              markImageSrcSettled(url);
              resolve();
            };
            img.src = url;
          });

          imagePreloadCache.current.set(url, task);
          return task;
        });

      return Promise.all(preloadTasks).then(() => undefined);
    },
    [],
  );

  const preloadScheduleImages = useCallback(
    (nextSchedules: Schedule[]) =>
      preloadImageUrls(getScheduleImageUrls(nextSchedules)),
    [preloadImageUrls],
  );

  // 일정 fetch (월 변경 시 / admin 작업 후 reload)
  const reloadSchedules = useCallback(
    (options?: { force?: boolean; silent?: boolean }) => {
      const monthKey = getScheduleMonthKey(currentDate);
      const cachedSchedules = scheduleCache.current.get(monthKey);
      const hasCachedSchedules = cachedSchedules !== undefined;
      const requestSeq = scheduleRequestSeq.current + 1;
      scheduleRequestSeq.current = requestSeq;

      if (hasCachedSchedules && !options?.force) {
        setSchedules(cachedSchedules);
        setIsSchedulesLoading(false);
      } else if (options?.silent) {
        setIsSchedulesLoading(false);
      } else {
        setIsSchedulesLoading(true);
      }

      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      fetch(`/api/schedule?year=${year}&month=${month}`)
        .then((r) => {
          if (!r.ok) throw new Error("Failed to load schedules");
          return r.json();
        })
        .then((d) => {
          const nextSchedules = d.schedules || [];
          scheduleCache.current.set(monthKey, nextSchedules);
          if (scheduleRequestSeq.current === requestSeq) {
            setSchedules(nextSchedules);
            setIsSchedulesLoading(false);
          }
          void preloadScheduleImages(nextSchedules);
        })
        .catch(() => {
          if (scheduleRequestSeq.current === requestSeq) {
            if (!hasCachedSchedules) {
              setSchedules([]);
            }
            setIsSchedulesLoading(false);
          }
        });
    },
    [currentDate, preloadScheduleImages],
  );

  useEffect(() => {
    reloadSchedules();
  }, [reloadSchedules]);

  useEffect(() => {
    if (!showMonthPicker) return;

    const handleOutsidePointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (target instanceof Node && !monthPickerRef.current?.contains(target)) {
        setShowMonthPicker(false);
      }
    };

    document.addEventListener("mousedown", handleOutsidePointer);
    document.addEventListener("touchstart", handleOutsidePointer);
    return () => {
      document.removeEventListener("mousedown", handleOutsidePointer);
      document.removeEventListener("touchstart", handleOutsidePointer);
    };
  }, [showMonthPicker]);

  useEffect(() => {
    if (!showMonthPicker) return;
    const frame = requestAnimationFrame(() => {
      const selected = monthPickerListRef.current?.querySelector(
        "[data-selected-month='true']",
      );
      selected?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [currentDate, showMonthPicker]);

  const prefetchScheduleMonth = useCallback(
    (date: Date) => {
      const monthKey = getScheduleMonthKey(date);
      if (scheduleCache.current.has(monthKey)) return;

      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      fetch(`/api/schedule?year=${year}&month=${month}`)
        .then((r) => {
          if (!r.ok) throw new Error("Failed to preload schedules");
          return r.json();
        })
        .then((d) => {
          const nextSchedules = d.schedules || [];
          return preloadScheduleImages(nextSchedules).then(() => {
            scheduleCache.current.set(monthKey, nextSchedules);
            rerenderScheduleCache((version) => version + 1);
          });
        })
        .catch(() => {
          // Preloading is only for smoother swipes; normal loading still handles failures.
        });
    },
    [preloadScheduleImages],
  );

  const prefetchDecorationMonth = useCallback(
    (date: Date) => {
      const monthKey = getScheduleMonthKey(date);
      if (decorationCache.current.has(monthKey)) return;
      const cachedMedia = getCachedMonthMedia(monthKey);
      if (cachedMedia?.decorations) {
        decorationCache.current.set(monthKey, cachedMedia.decorations);
        return;
      }

      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      fetch(`/api/decorations?year=${year}&month=${month}`)
        .then((r) => r.json())
        .then((d) => {
          const nextDecorations: CalendarDecoration[] = Array.isArray(
            d.decorations,
          )
            ? d.decorations
            : [];
          return preloadImageUrls(
            nextDecorations.map((deco) => deco.image_url),
          ).then(() => {
            decorationCache.current.set(monthKey, nextDecorations);
            setCachedMonthMedia(monthKey, {
              decorations: nextDecorations,
            });
            writeScheduleMonthMediaCache(monthKey, {
              decorations: nextDecorations,
            });
            rerenderScheduleCache((version) => version + 1);
          });
        })
        .catch(() => {
          decorationCache.current.set(monthKey, []);
        });
    },
    [getCachedMonthMedia, preloadImageUrls, setCachedMonthMedia],
  );

  const prefetchNoticeMonth = useCallback(
    (date: Date) => {
      const monthKey = getScheduleMonthKey(date);
      if (noticeCache.current.has(monthKey)) return;
      const cachedMedia = getCachedMonthMedia(monthKey);
      if (cachedMedia && "notice" in cachedMedia) {
        noticeCache.current.set(monthKey, cachedMedia.notice ?? null);
        return;
      }

      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      fetch(`/api/notices?year=${year}&month=${month}`)
        .then((r) => r.json())
        .then((d) => {
          const nextNotice = d.notice as MonthlyNotice | null | undefined;
          return preloadImageUrls([nextNotice?.image_url]).then(() => {
            noticeCache.current.set(monthKey, nextNotice ?? null);
            setCachedMonthMedia(monthKey, {
              notice: nextNotice ?? null,
            });
            writeScheduleMonthMediaCache(monthKey, {
              notice: nextNotice ?? null,
            });
            rerenderScheduleCache((version) => version + 1);
          });
        })
        .catch(() => {
          noticeCache.current.set(monthKey, null);
        });
    },
    [getCachedMonthMedia, preloadImageUrls, setCachedMonthMedia],
  );

  useEffect(() => {
    const adjacentMonths = [
      subMonths(currentDate, 1),
      addMonths(currentDate, 1),
    ];
    adjacentMonths.forEach((date) => {
      prefetchScheduleMonth(date);
      prefetchDecorationMonth(date);
      prefetchNoticeMonth(date);
    });
  }, [
    currentDate,
    prefetchDecorationMonth,
    prefetchNoticeMonth,
    prefetchScheduleMonth,
  ]);

  // 공휴일 데이터: 현재 보이는 달과 그 인접 연도까지 로드
  const [, setHolidayTick] = useState(0);
  useEffect(() => {
    return subscribeHolidays(() => setHolidayTick((n) => n + 1));
  }, []);
  useEffect(() => {
    const years = [
      currentDate.getFullYear(),
      subMonths(currentDate, 1).getFullYear(),
      addMonths(currentDate, 1).getFullYear(),
    ];
    Array.from(new Set(years)).forEach((y) => loadHolidaysForYear(y));
  }, [currentDate]);

  useEffect(() => {
    return () => {
      if (calendarDragPauseTimer.current) {
        clearTimeout(calendarDragPauseTimer.current);
      }
    };
  }, []);

  const changeMonth = useCallback(
    (date: Date) => {
      if (getScheduleMonthKey(date) === getScheduleMonthKey(currentDate)) {
        return;
      }
      const monthKey = getScheduleMonthKey(date);
      const cachedMedia = getCachedMonthMedia(monthKey);
      const cachedSchedules = scheduleCache.current.get(monthKey);
      const cachedDecorations =
        decorationCache.current.get(monthKey) ?? cachedMedia?.decorations;
      const cachedNotice = noticeCache.current.has(monthKey)
        ? noticeCache.current.get(monthKey)
        : cachedMedia && "notice" in cachedMedia
          ? (cachedMedia.notice ?? null)
          : undefined;
      scheduleRequestSeq.current += 1;
      if (calendarDragPauseTimer.current) {
        clearTimeout(calendarDragPauseTimer.current);
      }
      setIsCalendarDragPaused(true);
      calendarDragPauseTimer.current = setTimeout(() => {
        setIsCalendarDragPaused(false);
        calendarDragPauseTimer.current = null;
      }, 360);
      decorationRequestSeq.current += 1;
      noticeRequestSeq.current += 1;
      setCalendarSlideDirection(getMonthDirection(currentDate, date));
      setIsSchedulesLoading(cachedSchedules === undefined);
      setSchedules(cachedSchedules || []);
      setDecorations(cachedDecorations || []);
      setNotice(cachedNotice ?? null);
      setCurrentDate(date);
    },
    [currentDate, getCachedMonthMedia],
  );

  const handleCalendarTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    calendarSwipeRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      isSwiping: false,
    };
  }, []);

  const handleCalendarTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - calendarSwipeRef.current.startX;
    const deltaY = touch.clientY - calendarSwipeRef.current.startY;

    if (Math.abs(deltaX) > 14 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
      calendarSwipeRef.current.isSwiping = true;
    }
  }, []);

  const handleCalendarTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.changedTouches[0];
      if (!touch) return;

      const { startX, startY, isSwiping } = calendarSwipeRef.current;
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      const swipeThreshold = Math.min(
        96,
        (e.currentTarget.clientWidth || window.innerWidth) * 0.18,
      );
      const isHorizontalSwipe =
        isSwiping &&
        Math.abs(deltaX) >= swipeThreshold &&
        Math.abs(deltaX) > Math.abs(deltaY) * 1.4;

      if (!isSwiping) return;

      suppressCalendarClickRef.current = true;
      if (isHorizontalSwipe) {
        changeMonth(
          deltaX < 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1),
        );
      }
      window.setTimeout(() => {
        suppressCalendarClickRef.current = false;
      }, 250);
    },
    [changeMonth, currentDate],
  );

  const handleCalendarTouchCancel = useCallback(() => {
    calendarSwipeRef.current.isSwiping = false;
  }, []);

  const invalidateScheduleSearch = useCallback(() => {
    scheduleSearchCache.clear();
    setSearchRefreshToken((token) => token + 1);
  }, []);

  // 태그 fetch
  const reloadTags = useCallback(() => {
    fetch("/api/schedule/tags")
      .then((r) => r.json())
      .then((d) => {
        const nextTags = sortTagsForDisplay(d.tags || []);
        const tagById = new Map(nextTags.map((tag) => [tag.id, tag]));
        const applyLatestTag = (schedule: Schedule): Schedule => ({
          ...schedule,
          tag: schedule.tag_id ? tagById.get(schedule.tag_id) : undefined,
        });

        setTags(nextTags);
        setSchedules((prev) => prev.map(applyLatestTag));
        scheduleCache.current.forEach((cachedSchedules, monthKey) => {
          scheduleCache.current.set(
            monthKey,
            cachedSchedules.map(applyLatestTag),
          );
        });
        rerenderScheduleCache((version) => version + 1);
      })
      .catch(() => setTags([]));
  }, []);

  useEffect(() => {
    reloadTags();
  }, [reloadTags]);

  const handleTagsChanged = useCallback(() => {
    invalidateScheduleSearch();
    reloadTags();
  }, [invalidateScheduleSearch, reloadTags]);

  // 캘린더 데코 fetch (현재 보고 있는 달 기준)
  const reloadDecorations = useCallback(() => {
    const requestSeq = decorationRequestSeq.current + 1;
    decorationRequestSeq.current = requestSeq;
    const monthKey = getScheduleMonthKey(currentDate);
    const cachedMedia = getCachedMonthMedia(monthKey);
    const cachedDecorations =
      decorationCache.current.get(monthKey) ?? cachedMedia?.decorations;
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    setDecorations(cachedDecorations || []);
    fetch(`/api/decorations?year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((d) => {
        if (decorationRequestSeq.current !== requestSeq) return;
        const nextDecorations: CalendarDecoration[] = Array.isArray(
          d.decorations,
        )
          ? d.decorations
          : [];
        return preloadImageUrls(
          nextDecorations.map((deco) => deco.image_url),
        ).then(() => {
          if (decorationRequestSeq.current !== requestSeq) return;
          decorationCache.current.set(monthKey, nextDecorations);
          setCachedMonthMedia(monthKey, {
            decorations: nextDecorations,
          });
          writeScheduleMonthMediaCache(monthKey, {
            decorations: nextDecorations,
          });
          setDecorations(nextDecorations);
        });
      })
      .catch(() => {
        if (decorationRequestSeq.current === requestSeq && !cachedDecorations) {
          setDecorations([]);
        }
      });
  }, [currentDate, getCachedMonthMedia, preloadImageUrls, setCachedMonthMedia]);

  useEffect(() => {
    reloadDecorations();
  }, [reloadDecorations]);

  // cell_date(YYYY-MM-DD) → CalendarDecoration 매핑
  const decorationByDate = useMemo(() => {
    const map = new Map<string, CalendarDecoration>();
    const ownerYear = currentDate.getFullYear();
    const ownerMonth = currentDate.getMonth() + 1;
    for (const d of decorations) {
      if (d.owner_year !== ownerYear || d.owner_month !== ownerMonth) continue;
      map.set(d.cell_date, d);
    }
    return map;
  }, [currentDate, decorations]);

  const decorationCoveredDates = useMemo(() => {
    const set = new Set<string>();
    for (const deco of decorations) {
      if (
        deco.owner_year !== currentDate.getFullYear() ||
        deco.owner_month !== currentDate.getMonth() + 1
      ) {
        continue;
      }
      const span = Math.max(1, Math.min(7, deco.span || 1));
      const start = new Date(`${deco.cell_date}T00:00:00`);
      for (let i = 1; i < span; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        set.add(format(date, "yyyy-MM-dd"));
      }
    }
    return set;
  }, [currentDate, decorations]);

  // 월별 공지 fetch
  const reloadNotice = useCallback(() => {
    const requestSeq = noticeRequestSeq.current + 1;
    noticeRequestSeq.current = requestSeq;
    const monthKey = getScheduleMonthKey(currentDate);
    const cachedMedia = getCachedMonthMedia(monthKey);
    const cachedNotice = noticeCache.current.has(monthKey)
      ? noticeCache.current.get(monthKey)
      : cachedMedia && "notice" in cachedMedia
        ? (cachedMedia.notice ?? null)
        : undefined;
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    setNotice(cachedNotice ?? null);
    fetch(`/api/notices?year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((d) => {
        if (noticeRequestSeq.current !== requestSeq) return;
        const nextNotice = d.notice as MonthlyNotice | null | undefined;
        if (
          nextNotice &&
          (nextNotice.owner_year !== year || nextNotice.owner_month !== month)
        ) {
          noticeCache.current.set(monthKey, null);
          setCachedMonthMedia(monthKey, { notice: null });
          writeScheduleMonthMediaCache(monthKey, { notice: null });
          setNotice(null);
          return;
        }
        return preloadImageUrls([nextNotice?.image_url]).then(() => {
          if (noticeRequestSeq.current !== requestSeq) return;
          noticeCache.current.set(monthKey, nextNotice ?? null);
          setCachedMonthMedia(monthKey, {
            notice: nextNotice ?? null,
          });
          writeScheduleMonthMediaCache(monthKey, {
            notice: nextNotice ?? null,
          });
          setNotice(nextNotice ?? null);
        });
      })
      .catch(() => {
        if (
          noticeRequestSeq.current === requestSeq &&
          cachedNotice === undefined
        ) {
          setNotice(null);
        }
      });
  }, [currentDate, getCachedMonthMedia, preloadImageUrls, setCachedMonthMedia]);

  useEffect(() => {
    reloadNotice();
  }, [reloadNotice]);

  useEffect(() => {
    const channel = supabase
      .channel("schedule-page-live-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schedules" },
        () => {
          if (Date.now() < suppressScheduleRealtimeUntil.current) return;
          if (realtimeRefreshTimer.current) {
            clearTimeout(realtimeRefreshTimer.current);
          }
          realtimeRefreshTimer.current = setTimeout(() => {
            scheduleCache.current.clear();
            reloadSchedules({ force: true, silent: true });
          }, 150);
        },
      )
      .subscribe();

    return () => {
      if (realtimeRefreshTimer.current) {
        clearTimeout(realtimeRefreshTimer.current);
        realtimeRefreshTimer.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [reloadSchedules, supabase]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  const monthOptions = useMemo(() => getMonthOptions(todayDate), [todayDate]);
  const isViewingTodayMonth = isSameMonth(currentDate, todayDate);

  const schedulesByDate = useMemo(() => {
    const map = new Map<string, Schedule[]>();
    for (const schedule of schedules) {
      const key = getScheduleDayKey(schedule.date);
      const daySchedules = map.get(key);
      if (daySchedules) {
        daySchedules.push(schedule);
      } else {
        map.set(key, [schedule]);
      }
    }
    return map;
  }, [schedules]);

  const getSchedulesForDay = useCallback(
    (day: Date) => schedulesByDate.get(getScheduleDayKey(day)) ?? [],
    [schedulesByDate],
  );

  const selectedDaySchedules = useMemo(() => {
    if (!selectedDay) return [];
    const baseSchedules = getSchedulesForDay(selectedDay);
    if (
      !searchEditSchedule ||
      searchEditSchedule.date !== getScheduleDayKey(selectedDay) ||
      baseSchedules.some((schedule) => schedule.id === searchEditSchedule.id)
    ) {
      return baseSchedules;
    }
    return [...baseSchedules, searchEditSchedule];
  }, [getSchedulesForDay, searchEditSchedule, selectedDay]);

  const handleDayPopupDayChange = useCallback(
    (nextDay: Date) => {
      setSelectedDay(nextDay);
      setSearchHighlightScheduleId(null);
      if (!isSameMonth(currentDate, nextDay)) {
        changeMonth(nextDay);
      }
    },
    [changeMonth, currentDate],
  );

  const suppressScheduleRealtime = useCallback((duration = 2500) => {
    suppressScheduleRealtimeUntil.current = Math.max(
      suppressScheduleRealtimeUntil.current,
      Date.now() + duration,
    );
  }, []);

  const handleScheduleSaved = useCallback(
    (savedSchedule: Schedule, affectedSchedules?: Schedule[]) => {
      const schedulesToMerge =
        affectedSchedules && affectedSchedules.length > 0
          ? affectedSchedules
          : [savedSchedule];
      const schedulesById = new Map(
        schedulesToMerge.map((schedule) => [schedule.id, schedule]),
      );
      const affectedMonthKeys = new Set(
        schedulesToMerge.map((schedule) => getScheduleMonthKey(schedule.date)),
      );
      const upsertSchedules = (items: Schedule[]) => {
        const remaining = items.filter(
          (schedule) => !schedulesById.has(schedule.id),
        );
        return sortSchedulesForDisplay([...remaining, ...schedulesToMerge]);
      };

      setSchedules(upsertSchedules);

      const currentMonthKey = getScheduleMonthKey(currentDate);
      scheduleCache.current.forEach((cachedSchedules, monthKey) => {
        const hasSchedule = cachedSchedules.some((schedule) =>
          schedulesById.has(schedule.id),
        );
        if (
          !hasSchedule &&
          monthKey !== currentMonthKey &&
          !affectedMonthKeys.has(monthKey)
        ) {
          return;
        }
        scheduleCache.current.set(monthKey, upsertSchedules(cachedSchedules));
      });
      rerenderScheduleCache((version) => version + 1);
      preloadScheduleImages(schedulesToMerge);
      invalidateScheduleSearch();
    },
    [currentDate, invalidateScheduleSearch, preloadScheduleImages],
  );

  const handleScheduleDeleted = useCallback(
    (deletedId: string) => {
      setSchedules((prev) =>
        prev.filter((schedule) => schedule.id !== deletedId),
      );
      scheduleCache.current.forEach((cachedSchedules, monthKey) => {
        if (!cachedSchedules.some((schedule) => schedule.id === deletedId)) {
          return;
        }
        scheduleCache.current.set(
          monthKey,
          cachedSchedules.filter((schedule) => schedule.id !== deletedId),
        );
      });
      rerenderScheduleCache((version) => version + 1);
      invalidateScheduleSearch();
    },
    [invalidateScheduleSearch],
  );

  const handleDayClick = (day: Date) => {
    if (suppressCalendarClickRef.current) return;
    setSelectedDay(day);
    setShowDayPopup(true);
  };

  // ===== Drag & Drop =====
  const sensors = useSensors(
    // 작은 움직임은 무시 — 셀 클릭과 충돌 방지
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingTimeChange, setPendingTimeChange] = useState<{
    schedule: Schedule;
    targetDate: string;
    targetTime: string | null;
    targetIndex: number;
  } | null>(null);

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  // active(드래그한 일정)을 도착 셀의 targetIndex 위치로 이동시키고 sort_order 일괄 갱신
  const applyMove = useCallback(
    (
      activeSchedule: Schedule,
      targetDate: string,
      targetTime: string | null,
      targetIndex: number,
    ) => {
      const before = schedules;
      // 출발 셀의 일정에서 active 제거
      const remaining = before.filter((s) => s.id !== activeSchedule.id);

      // 도착 셀 일정 추출 (target에서 active 제외) + targetIndex에 active 삽입
      const targetCell = remaining.filter((s) => s.date === targetDate);
      const others = remaining.filter((s) => s.date !== targetDate);
      const moved: Schedule = {
        ...activeSchedule,
        date: targetDate,
        time: targetTime,
      };
      const insertAt = Math.max(0, Math.min(targetIndex, targetCell.length));
      targetCell.splice(insertAt, 0, moved);

      // 도착 셀의 sort_order를 0..n으로 재할당 (시간 그룹 단위가 아니라 셀 단위 — 단순화)
      const renumbered = targetCell.map((s, i) => ({ ...s, sort_order: i }));

      const next = [...others, ...renumbered];

      // 변경된 항목만 추리기 (id 기준 비교)
      const changed: {
        id: string;
        date?: string;
        time?: string | null;
        sort_order?: number;
      }[] = [];
      for (const s of next) {
        const prev = before.find((p) => p.id === s.id);
        if (!prev) continue;
        const diff: (typeof changed)[number] = { id: s.id };
        let dirty = false;
        if (prev.date !== s.date) {
          diff.date = s.date;
          dirty = true;
        }
        if ((prev.time || null) !== (s.time || null)) {
          diff.time = s.time;
          dirty = true;
        }
        if (prev.sort_order !== s.sort_order) {
          diff.sort_order = s.sort_order;
          dirty = true;
        }
        if (dirty) changed.push(diff);
      }

      // 낙관적 업데이트
      setSchedules(next);

      if (changed.length === 0) return;

      suppressScheduleRealtime();
      fetch("/api/schedule/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: changed }),
      })
        .then(async (res) => {
          if (!res.ok) {
            // 롤백
            setSchedules(before);
            alert("일정 이동 저장에 실패했습니다.");
            return;
          }
          if (res.status === 207) {
            const data = await res.json().catch(() => null);
            setSchedules(before);
            alert(
              data?.failed?.length
                ? `일부 일정 이동 저장에 실패했습니다. (${data.failed.length}건)`
                : "일부 일정 이동 저장에 실패했습니다.",
            );
          }
        })
        .catch(() => {
          setSchedules(before);
          alert("일정 이동 저장에 실패했습니다.");
        });
    },
    [schedules, suppressScheduleRealtime],
  );

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!isAdmin) return;
    const { active, over } = e;
    if (!over) return;

    const activeSchedule = schedules.find((s) => s.id === String(active.id));
    if (!activeSchedule) return;

    // over.id 형식: "cell:YYYY-MM-DD" 또는 일정 id
    const overId = String(over.id);
    let targetDate: string;
    let targetIndex: number;
    let targetTime: string | null;
    const getTargetIndexFromDragPosition = (
      targetCell: Schedule[],
      fallbackIndex: number,
    ) => {
      const activeRect = e.active.rect.current.translated;
      if (!activeRect) return fallbackIndex;
      const activeCenterY = activeRect.top + activeRect.height / 2;
      const index = targetCell.findIndex((s) => {
        const el = document.querySelector<HTMLElement>(
          `[data-schedule-card-id="${s.id}"]`,
        );
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return activeCenterY < rect.top + rect.height / 2;
      });
      return index < 0 ? targetCell.length : index;
    };

    if (overId.startsWith("cell:")) {
      targetDate = overId.slice(5);
      const targetCell = schedules.filter(
        (s) => s.date === targetDate && s.id !== activeSchedule.id,
      );
      targetIndex = getTargetIndexFromDragPosition(
        targetCell,
        targetCell.length,
      );
      // 셀에 직접 드롭하면 위치만 바꾸고 시간 정보는 유지
      targetTime = activeSchedule.time;
    } else {
      const targetItemId = overId.startsWith("item:")
        ? overId.slice(5)
        : overId;
      const targetItem = schedules.find((s) => s.id === targetItemId);
      if (!targetItem) return;
      targetDate = targetItem.date;
      const targetCell = schedules.filter(
        (s) => s.date === targetDate && s.id !== activeSchedule.id,
      );
      const idxOfTarget = targetCell.findIndex((s) => s.id === targetItemId);
      targetIndex =
        idxOfTarget < 0
          ? targetCell.length
          : getTargetIndexFromDragPosition(
              targetCell,
              idxOfTarget < 0 ? targetCell.length : idxOfTarget,
            );
      const isBeforeTarget = idxOfTarget >= 0 && targetIndex <= idxOfTarget;

      // 시간 그룹 정책:
      // - 다른 시간 카드의 위쪽 절반에 놓으면 "그 앞에 삽입"으로 보고 시간 유지
      // - 같은 시간(또는 둘 다 시간 없음): 그냥 순서만 이동
      // - 다른 시간 그룹: 동의 팝업
      const sameTime =
        normalizeTime(activeSchedule.time) === normalizeTime(targetItem.time);
      if (sameTime || isBeforeTarget) {
        targetTime = activeSchedule.time;
      } else {
        // 동의 팝업 표시 — 결정 후 확정
        setPendingTimeChange({
          schedule: activeSchedule,
          targetDate,
          targetTime: targetItem.time,
          targetIndex,
        });
        return;
      }
    }

    applyMove(activeSchedule, targetDate, targetTime, targetIndex);
  };

  const activeSchedule = activeId
    ? (schedules.find((s) => s.id === activeId) ?? null)
    : null;

  const renderCalendarMonth = (
    date: Date,
    monthSchedulesByDate: Map<string, Schedule[]>,
    isLoading: boolean,
    interactive: boolean,
    dragEnabled: boolean,
  ) => {
    const renderMonthStart = startOfMonth(date);
    const renderMonthEnd = endOfMonth(date);
    const renderCalStart = startOfWeek(renderMonthStart);
    const renderCalEnd = endOfWeek(renderMonthEnd);
    const renderCalDays = eachDayOfInterval({
      start: renderCalStart,
      end: renderCalEnd,
    });
    const getMonthSchedulesForDay = (day: Date) =>
      monthSchedulesByDate.get(getScheduleDayKey(day)) ?? [];
    const canUseDnd = interactive && dragEnabled && isAdmin && !isLoading;
    const todayKey = isClientReady ? getScheduleDayKey(getKoreaToday()) : null;

    const monthGrid = (
      <>
        <div className="grid grid-cols-7">
          {renderCalDays.map((day, idx) => {
            const daySchedules = getMonthSchedulesForDay(day);
            const inMonth = isSameMonth(day, date);
            const cellDateStr = format(day, "yyyy-MM-dd");
            const today = cellDateStr === todayKey;
            const dayOfWeek = day.getDay();
            const single = daySchedules.length === 1;
            const showSkeleton = isLoading && inMonth;
            if (decorationCoveredDates.has(cellDateStr)) return null;
            const decoration = decorationByDate.get(cellDateStr) ?? null;
            const decorationActive = !!decoration;
            const decorationSpan = decorationActive
              ? Math.max(1, Math.min(7, decoration!.span || 1))
              : 1;

            return (
              <CalendarCell
                key={day.toISOString()}
                day={day}
                inMonth={inMonth}
                today={today}
                colSpan={decorationSpan}
                hasDecoration={decorationActive}
                droppable={canUseDnd && inMonth}
                onClick={() =>
                  interactive && inMonth && !isLoading
                    ? handleDayClick(day)
                    : undefined
                }
              >
                {/* 이전/다음 달 일자 셀 + 데코면 헤더 숨김 (데코가 일자 영역까지 통째로 차지) */}
                {!(decorationActive && !inMonth) && (
                  <div
                    className="mb-1.5 -mx-0.5 -mt-0.5 flex items-center gap-1.5 px-1.5 py-1 text-sm font-bold sm:-mx-1 sm:-mt-1.5 sm:px-1.5"
                    style={{
                      backgroundColor: DAY_HEADER_BG_COLORS[dayOfWeek],
                      color: DAY_HEADER_TEXT_COLORS[dayOfWeek],
                    }}
                  >
                    <span>{format(day, "d")}</span>
                    {(() => {
                      const holiday = inMonth ? getHolidayName(day) : null;
                      return holiday ? (
                        <span
                          className="truncate text-[11px] font-medium opacity-95"
                          title={holiday}
                        >
                          {holiday}
                        </span>
                      ) : null;
                    })()}
                  </div>
                )}

                {/* 데코 이미지가 있으면 일정 자리를 데코로 대체 */}
                {decorationActive ? (
                  <div
                    className={`flex min-h-0 flex-1 flex-col items-center justify-start gap-1 overflow-hidden ${
                      !inMonth ? "-m-0.5 sm:-m-1.5" : ""
                    }`}
                  >
                    {decoration!.image_url && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setPreviewDecoration(decoration!);
                        }}
                        className={`flex max-w-full cursor-zoom-in items-start justify-center rounded-lg outline-none transition hover:brightness-105 focus-visible:ring-2 focus-visible:ring-dunggeure-primary ${
                          decoration!.caption
                            ? "min-h-0 max-h-24 shrink sm:min-h-20 sm:max-h-40"
                            : "min-h-0 max-h-52 flex-1 self-stretch"
                        }`}
                        aria-label="데코 이미지 크게 보기"
                      >
                        <LoadingImage
                          src={decoration!.image_url}
                          alt={decoration!.caption || "데코 이미지"}
                          width={decoration!.caption ? 320 : 640}
                          height={decoration!.caption ? 180 : 360}
                          wrapperClassName={`max-h-full max-w-full rounded-lg ${
                            decoration!.caption
                              ? "aspect-video w-full"
                              : "h-full w-full"
                          }`}
                          skeletonClassName="rounded-lg"
                          className={`block max-h-full max-w-full object-contain ${
                            decoration!.caption
                              ? ""
                              : "h-full w-full object-top"
                          }`}
                        />
                      </button>
                    )}
                    {decoration!.caption && (
                      <p
                        className={`line-clamp-2 max-w-full whitespace-pre-wrap rounded px-1 leading-tigh ${
                          decoration!.image_url
                            ? "text-center"
                            : "w-full h-full py-2 flex-1 self-stretch flex items-center justify-center"
                        }`}
                        style={buildScheduleContentStyle(
                          getDecorationCaptionStyle(decoration!),
                        )}
                      >
                        <RichTextContent
                          segments={getDecorationCaptionRichSegments(
                            decoration!,
                          )}
                          fallback={decoration!.caption}
                        />
                      </p>
                    )}
                  </div>
                ) : showSkeleton ? (
                  <ScheduleCellSkeleton seed={idx} />
                ) : (
                  (() => {
                    const hasAnyTime = daySchedules.some(
                      (s) => !!s.time || !!s.meta?.time_note?.trim(),
                    );
                    const scheduleCards = daySchedules.map(
                      (sch, scheduleIdx) => {
                        const showTime =
                          !!sch.time &&
                          normalizeTime(sch.time) !==
                            normalizeTime(daySchedules[scheduleIdx - 1]?.time);
                        const hasPreviousTime = daySchedules
                          .slice(0, scheduleIdx)
                          .some((schedule) => normalizeTime(schedule.time));
                        const hasNextTime = daySchedules
                          .slice(scheduleIdx + 1)
                          .some((schedule) => normalizeTime(schedule.time));
                        const showTimePlaceholder =
                          hasAnyTime &&
                          !normalizeTime(sch.time) &&
                          !sch.image_url &&
                          !hasPreviousTime &&
                          hasNextTime;
                        const showLeftColumn =
                          hasAnyTime ||
                          !!sch.image_url ||
                          !!sch.meta?.time_note?.trim();
                        return (
                          <ScheduleCard
                            key={sch.id}
                            sch={sch}
                            tags={tags}
                            isAdmin={isAdmin}
                            showTime={showTime}
                            showTimePlaceholder={showTimePlaceholder}
                            showLeftColumn={showLeftColumn}
                            single={single}
                            dayOfWeek={dayOfWeek}
                            draggable={canUseDnd}
                            isDragging={canUseDnd && activeId === sch.id}
                            onLocalScheduleMutation={suppressScheduleRealtime}
                            onScheduleSaved={handleScheduleSaved}
                            onScheduleDeleted={handleScheduleDeleted}
                            onOpen={() => handleDayClick(day)}
                          />
                        );
                      },
                    );
                    return (
                      <div
                        className={`flex flex-col gap-1 ${
                          single ? "min-h-0 flex-1" : ""
                        }`}
                      >
                        {canUseDnd ? (
                          <SortableContext
                            items={daySchedules.map((sch) => sch.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            {scheduleCards}
                          </SortableContext>
                        ) : (
                          scheduleCards
                        )}
                      </div>
                    );
                  })()
                )}

                {/* 관리자: 빈 일정에 + 표시 (데코로 대체된 셀 제외) */}
                {!decorationActive &&
                  interactive &&
                  isAdmin &&
                  inMonth &&
                  !isLoading &&
                  daySchedules.length === 0 && (
                    <div className="flex items-center justify-center flex-1 text-dunggeure-light hover:text-dunggeure-primary transition">
                      <Plus size={14} />
                    </div>
                  )}
              </CalendarCell>
            );
          })}
        </div>
      </>
    );

    return (
      <>
        {/* 요일 헤더 */}
        <div className="grid grid-cols-7">
          {DAY_HEADERS.map((day, i) => (
            <div
              key={day}
              className="text-center py-2 text-sm font-bold border-b border-[var(--border)]"
              style={{ color: DAY_HEADER_COLORS[i] }}
            >
              {day}
            </div>
          ))}
        </div>

        {!canUseDnd ? (
          monthGrid
        ) : (
          <>
            {/* 일자 그리드 */}
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={() => {
                setActiveId(null);
              }}
            >
              {monthGrid}
              <DragOverlay dropAnimation={null}>
                {activeSchedule ? (
                  <div
                    className="px-2 py-1 rounded text-[13px] font-bold shadow-lg"
                    style={{
                      ...buildScheduleTagBorderStyle(activeSchedule.tag),
                      backgroundColor:
                        activeSchedule.tag?.bg_color || "var(--card)",
                      color: activeSchedule.tag?.font_color || "var(--text)",
                    }}
                  >
                    {activeSchedule.time && (
                      <span className="font-bold mr-1">
                        {displayTime(activeSchedule.time)}
                      </span>
                    )}
                    {activeSchedule.content || "(내용 없음)"}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </>
        )}
      </>
    );
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--bg)]">
      <Navbar />

      <div className="mx-auto max-w-[1440px] overflow-x-hidden px-4 py-6">
        <div>
          {/* ===== 달력 영역 ===== */}
          <div className="flex-1 min-w-0 font-hakgyoansimnadeuri text-[15px] font-bold">
            {/* 헤더 (월 네비 + 공지 + 액션 + 범례)
                넓은 화면(lg+)은 grid로:
                  [월 네비]  [공지(2행 차지)]  [날짜선택+검색]
                  [범례]                       [공지+데코+오늘]
                좁은 화면은 두 줄 flex로 + 공지는 캘린더 위 별도 박스 */}
            <div className="lg:grid lg:grid-cols-[auto_1fr_auto] lg:grid-rows-[auto_auto] lg:gap-x-4 lg:gap-y-3 lg:mb-3">
              {/* 월 네비게이션 */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 lg:mb-0 lg:contents">
                <div className="flex items-center gap-1.5 lg:col-start-1 lg:row-start-1">
                  <button
                    onClick={() => changeMonth(subMonths(currentDate, 1))}
                    className="p-2 rounded-lg hover:bg-dunggeure-lighter/30 transition"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <h2 className="text-2xl font-bold text-dunggeure-dark min-w-[100px] text-center">
                    {`${format(currentDate, "M월", { locale: ko })} (${format(currentDate, "MMM").toUpperCase()})`}
                  </h2>
                  <button
                    onClick={() => changeMonth(addMonths(currentDate, 1))}
                    className="p-2 rounded-lg hover:bg-dunggeure-lighter/30 transition"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>

                <div className="flex items-center justify-end gap-1.5 lg:col-start-3 lg:row-start-1 lg:justify-self-end">
                  {/* 월 선택 */}
                  <div ref={monthPickerRef} className="relative">
                    <button
                      onClick={() => setShowMonthPicker(!showMonthPicker)}
                      className="flex w-[8rem] items-center justify-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm transition hover:bg-dunggeure-lighter/30"
                    >
                      <CalendarDays size={14} />
                      {format(currentDate, "yyyy년 M월")}
                    </button>
                    {showMonthPicker && (
                      <div className="absolute -right-2 top-full z-50 mt-1 min-w-[120px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl">
                        <div
                          ref={monthPickerListRef}
                          className="max-h-64 overflow-y-auto p-2"
                        >
                          {monthOptions.map((opt) => {
                            const selected =
                              currentDate.getFullYear() === opt.year &&
                              currentDate.getMonth() === opt.month;
                            return (
                              <button
                                key={`${opt.year}-${opt.month}`}
                                data-selected-month={
                                  selected ? "true" : undefined
                                }
                                onClick={() => {
                                  changeMonth(new Date(opt.year, opt.month));
                                  setShowMonthPicker(false);
                                }}
                                className={`block w-full rounded-lg px-3 py-1.5 text-left text-sm transition ${
                                  selected
                                    ? "bg-dunggeure-primary text-white"
                                    : "hover:bg-dunggeure-lighter/30"
                                }`}
                              >
                                {opt.year}년 {opt.month + 1}월
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 검색 */}
                  <button
                    onClick={() => setShowSearch(true)}
                    className="p-2 rounded-lg border border-[var(--border)] hover:bg-dunggeure-lighter/30 transition"
                  >
                    <Search size={16} />
                  </button>
                </div>
              </div>

              {/* 공지: 넓은 화면에서는 가운데 컬럼이 두 행을 차지 */}
              {(notice?.content || notice?.image_url) && (
                <div className="relative hidden min-w-0 overflow-hidden rounded-xl border border-dunggeure-light bg-dunggeure-lighter/20 px-4 py-2 pr-24 text-sm text-dunggeure-dark whitespace-pre-wrap dark:bg-dunggeure-primary/10 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:flex lg:items-center">
                  {notice.content && (
                    <span className="relative z-10 line-clamp-3 whitespace-pre-line">
                      {notice.content}
                    </span>
                  )}
                  <img
                    src={notice.image_url || "/nav_dung.png"}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-[-1.15rem] right-0 h-24 w-auto opacity-45"
                  />
                </div>
              )}

              {/* 범례 */}
              <div className="mb-3 flex items-center justify-between gap-2 text-sm lg:mb-0 lg:contents">
                <div className="flex max-w-[13rem] items-baseline min-w-0 flex-wrap gap-2 lg:col-start-1 lg:row-start-2">
                  {legendTags.map((tag) => (
                    <span
                      key={tag.id}
                      className="rounded px-1.5 py-0.5 text-xs"
                      style={buildScheduleTagStyle(tag)}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
                <div className="ml-auto flex shrink-0 items-center justify-end gap-2 lg:col-start-3 lg:row-start-2 lg:justify-self-end">
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setShowNoticeModal(true)}
                      className="cursor-pointer rounded-lg border border-[var(--border)] px-3 py-1 text-sm text-dunggeure-primary transition hover:border-dunggeure-light hover:bg-dunggeure-lighter/30 hover:text-dunggeure-dark active:scale-[0.98]"
                      title="이 달의 공지 작성/수정"
                    >
                      공지
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setShowDecoModal(true)}
                      className="cursor-pointer rounded-lg border border-[var(--border)] px-3 py-1 text-sm text-dunggeure-primary transition hover:border-dunggeure-light hover:bg-dunggeure-lighter/30 hover:text-dunggeure-dark active:scale-[0.98]"
                      title="이 달의 셀에 데코 이미지 추가/삭제"
                    >
                      데코
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const nextToday = getKoreaToday();
                      setTodayDate(nextToday);
                      changeMonth(nextToday);
                    }}
                    aria-current={isViewingTodayMonth ? "date" : undefined}
                    className="cursor-pointer rounded-lg border border-[var(--border)] px-3 py-1 text-sm text-dunggeure-primary transition hover:border-dunggeure-light hover:bg-dunggeure-lighter/30 hover:text-dunggeure-dark active:scale-[0.98]"
                  >
                    오늘
                  </button>
                </div>
              </div>
            </div>

            {/* 월별 공지 (좁은 화면 전용; 넓은 화면은 헤더 grid 가운데) */}
            {(notice?.content || notice?.image_url) && (
              <div className="relative mb-3 overflow-hidden rounded-xl border border-dunggeure-light bg-dunggeure-lighter/20 px-4 py-2.5 pr-20 text-sm text-dunggeure-dark whitespace-pre-wrap dark:bg-dunggeure-primary/10 lg:hidden">
                {notice.content && (
                  <span className="relative z-10 block whitespace-pre-line">
                    {notice.content}
                  </span>
                )}
                <img
                  src={notice.image_url || "/nav_dung.png"}
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-[-0.85rem] right-0 h-16 w-auto opacity-40"
                />
              </div>
            )}

            {/* 달력 그리드 */}
            <div
              className="touch-pan-y overflow-hidden rounded-xl border border-[var(--border)] overscroll-x-none"
              style={{ touchAction: "pan-y" }}
              onTouchStart={handleCalendarTouchStart}
              onTouchMove={handleCalendarTouchMove}
              onTouchEnd={handleCalendarTouchEnd}
              onTouchCancel={handleCalendarTouchCancel}
            >
              <div className="grid w-full min-w-0">
                <AnimatePresence
                  initial={false}
                  custom={calendarSlideDirection}
                >
                  <motion.div
                    key={getScheduleMonthKey(currentDate)}
                    custom={calendarSlideDirection}
                    variants={calendarMonthVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.28, ease: "easeOut" }}
                    className="col-start-1 row-start-1 w-full min-w-0"
                  >
                    {renderCalendarMonth(
                      currentDate,
                      schedulesByDate,
                      isSchedulesLoading,
                      true,
                      !isCalendarDragPaused,
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 일정 검색 팝업 */}
      {showSearch && (
        <SearchPopup
          tags={tags}
          isAdmin={isAdmin}
          refreshToken={searchRefreshToken}
          onClose={() => setShowSearch(false)}
          onViewSchedule={(schedule) => {
            const targetDate = new Date(`${schedule.date}T00:00:00`);
            setSelectedDay(targetDate);
            setSearchEditScheduleId(null);
            setSearchEditSchedule(null);
            setSearchHighlightScheduleId(schedule.id);
            setShowDayPopup(true);
            if (!isSameMonth(currentDate, targetDate)) {
              changeMonth(targetDate);
            }
          }}
          onEditSchedule={(schedule) => {
            const targetDate = new Date(`${schedule.date}T00:00:00`);
            setSelectedDay(targetDate);
            setSearchEditScheduleId(schedule.id);
            setSearchEditSchedule(schedule);
            setSearchHighlightScheduleId(null);
            setShowDayPopup(true);
          }}
        />
      )}

      {showDecoModal && (
        <DecorationManager
          year={currentDate.getFullYear()}
          month={currentDate.getMonth() + 1}
          calDays={calDays}
          decorations={decorations}
          onClose={() => setShowDecoModal(false)}
          onChanged={reloadDecorations}
        />
      )}

      {showNoticeModal && (
        <NoticeEditor
          year={currentDate.getFullYear()}
          month={currentDate.getMonth() + 1}
          notice={notice}
          onClose={() => setShowNoticeModal(false)}
          onSaved={(next) => {
            const monthKey = getScheduleMonthKey(currentDate);
            noticeCache.current.set(monthKey, next);
            setCachedMonthMedia(monthKey, { notice: next });
            writeScheduleMonthMediaCache(monthKey, { notice: next });
            setNotice(next);
            setShowNoticeModal(false);
          }}
        />
      )}

      <DecorationImagePreview
        decoration={previewDecoration}
        onClose={() => setPreviewDecoration(null)}
      />

      {/* 일정 상세 팝업 */}
      {showDayPopup && selectedDay && (
        <DayPopup
          day={selectedDay}
          schedules={selectedDaySchedules}
          tags={tags}
          isAdmin={isAdmin}
          initialEditScheduleId={searchEditScheduleId}
          initialHighlightScheduleId={searchHighlightScheduleId}
          onInitialEditHandled={() => setSearchEditScheduleId(null)}
          onDayChange={handleDayPopupDayChange}
          onClose={() => {
            setShowDayPopup(false);
            setSearchEditScheduleId(null);
            setSearchEditSchedule(null);
            setSearchHighlightScheduleId(null);
          }}
          onLocalScheduleMutation={suppressScheduleRealtime}
          onScheduleSaved={handleScheduleSaved}
          onScheduleDeleted={handleScheduleDeleted}
          onSchedulesReordered={(reorderedSchedules) => {
            const reorderedById = new Map(
              reorderedSchedules.map((schedule) => [schedule.id, schedule]),
            );
            const applyReorderedSchedules = (items: Schedule[]) =>
              sortSchedulesForDisplay(
                items.map((schedule) =>
                  reorderedById.get(schedule.id)
                    ? { ...schedule, ...reorderedById.get(schedule.id)! }
                    : schedule,
                ),
              );

            setSchedules(applyReorderedSchedules);
            scheduleCache.current.forEach((cachedSchedules, monthKey) => {
              if (
                !cachedSchedules.some((schedule) =>
                  reorderedById.has(schedule.id),
                )
              ) {
                return;
              }
              scheduleCache.current.set(
                monthKey,
                applyReorderedSchedules(cachedSchedules),
              );
            });
            rerenderScheduleCache((version) => version + 1);
            invalidateScheduleSearch();
          }}
          onTagsChanged={handleTagsChanged}
        />
      )}

      {/* 다른 시간 그룹으로 드롭 시 동의 팝업 */}
      {pendingTimeChange && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-3">
            <h3 className="font-bold text-dunggeure-dark">
              시간을 변경할까요?
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              일정 시간을{" "}
              <span className="font-bold text-dunggeure-primary">
                {normalizeTime(pendingTimeChange.schedule.time) ||
                  "(시간 없음)"}
              </span>
              에서{" "}
              <span className="font-bold text-dunggeure-primary">
                {normalizeTime(pendingTimeChange.targetTime) || "(시간 없음)"}
              </span>
              으로 변경하시겠습니까?
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              &apos;아니오&apos;를 누르면 시간은 그대로 두고 위치만 옮깁니다.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setPendingTimeChange(null)}
                className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] hover:bg-dunggeure-lighter/30 transition"
              >
                취소
              </button>
              <button
                onClick={() => {
                  const p = pendingTimeChange;
                  setPendingTimeChange(null);
                  applyMove(
                    p.schedule,
                    p.targetDate,
                    p.schedule.time, // 시간 그대로
                    p.targetIndex,
                  );
                }}
                className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] hover:bg-dunggeure-lighter/30 transition"
              >
                아니오 (시간 유지)
              </button>
              <button
                onClick={() => {
                  const p = pendingTimeChange;
                  setPendingTimeChange(null);
                  applyMove(
                    p.schedule,
                    p.targetDate,
                    p.targetTime,
                    p.targetIndex,
                  );
                }}
                className="px-3 py-1.5 text-sm rounded-lg bg-dunggeure-primary text-white hover:bg-dunggeure-dark transition"
              >
                예 (시간 변경)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== 캘린더 셀 (Droppable) =====
function CalendarCell({
  day,
  inMonth,
  today,
  colSpan = 1,
  onClick,
  children,
  hasDecoration = false,
  droppable = false,
}: {
  day: Date;
  inMonth: boolean;
  today: boolean;
  colSpan?: number;
  onClick: () => void;
  children: React.ReactNode;
  hasDecoration?: boolean;
  droppable?: boolean;
}) {
  const dateStr = format(day, "yyyy-MM-dd");
  const { setNodeRef, isOver } = useDroppable({
    id: `cell:${dateStr}`,
    disabled: !droppable,
  });
  // 데코가 적용된 셀은 inMonth 여부와 무관하게 선명하게 보여줌
  const dimOutOfMonth = !inMonth && !hasDecoration;
  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      style={{
        gridColumn:
          colSpan > 1 ? `span ${colSpan} / span ${colSpan}` : undefined,
      }}
      className={`calendar-day flex min-w-0 flex-col p-0.5 sm:px-1 sm:py-1.5 cursor-pointer transition-all min-h-[110px] ${
        dimOutOfMonth ? "opacity-30" : ""
      } ${today ? "calendar-day-today" : ""} ${
        droppable && isOver ? "bg-dunggeure-lighter/40" : ""
      }`}
    >
      {children}
    </div>
  );
}

function ScheduleCellSkeleton({ seed }: { seed: number }) {
  const rows = (seed % 3) + 1;
  const widths = ["w-4/5", "w-3/5", "w-2/3"];

  return (
    <div className="flex flex-col gap-1" aria-hidden="true">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="flex items-center gap-1">
          {idx === 0 && seed % 2 === 0 && (
            <div className="skeleton-pulse h-3 w-7 shrink-0" />
          )}
          <div
            className={`skeleton-pulse h-5 ${
              widths[(seed + idx) % widths.length]
            }`}
          />
        </div>
      ))}
    </div>
  );
}

function LoadingImage({
  src,
  alt,
  className = "",
  wrapperClassName = "",
  skeletonClassName = "",
  width,
  height,
  onClick,
}: {
  src: string;
  alt: string;
  className?: string;
  wrapperClassName?: string;
  skeletonClassName?: string;
  width?: number;
  height?: number;
  onClick?: (event: ReactMouseEvent<HTMLSpanElement>) => void;
}) {
  const [loaded, setLoaded] = useState(() => !src || settledImageSrcs.has(src));
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src || settledImageSrcs.has(src)) {
      setLoaded(true);
      return;
    }

    const img = imgRef.current;
    if (!img) return;

    if (img.complete && img.naturalWidth > 0) {
      markImageSrcSettled(src);
      setLoaded(true);
      return;
    }

    setLoaded(false);
  }, [src]);

  return (
    <span
      onClick={onClick}
      className={`relative inline-flex min-h-0 min-w-0 overflow-hidden ${wrapperClassName}`}
    >
      {!loaded && (
        <span
          className={`skeleton-pulse pointer-events-none absolute inset-0 ${skeletonClassName}`}
          aria-hidden="true"
        />
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        width={width}
        height={height}
        onLoad={() => {
          markImageSrcSettled(src);
          setLoaded(true);
        }}
        onError={() => {
          markImageSrcSettled(src);
          setLoaded(true);
        }}
        className={`${className} transition-opacity duration-200 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </span>
  );
}

function DecorationImagePreview({
  decoration,
  onClose,
}: {
  decoration: CalendarDecoration | null;
  onClose: () => void;
}) {
  const previewUrl = decoration?.original_image_url || decoration?.image_url;

  useEffect(() => {
    if (!previewUrl) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewUrl, onClose]);

  if (!decoration || !previewUrl) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div className="flex max-h-[92dvh] max-w-[92vw] flex-col items-center gap-3">
        <div className="flex w-full max-w-[92vw] justify-end">
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white shadow-lg transition hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>
        <LoadingImage
          src={previewUrl}
          alt={decoration.caption || "데코 이미지"}
          onClick={(event) => event.stopPropagation()}
          wrapperClassName="min-h-40 min-w-40 items-center justify-center rounded-xl shadow-2xl sm:min-h-60 sm:min-w-60 max-h-[calc(92dvh-4.5rem)] max-w-[92vw]"
          skeletonClassName="rounded-xl"
          className="max-h-[calc(92dvh-4.5rem)] max-w-[92vw] rounded-xl object-contain"
        />
        {decoration.caption && (
          <div
            onClick={(event) => event.stopPropagation()}
            className="max-w-[92vw] rounded-lg px-3 py-2 text-center text-sm shadow-xl"
            style={buildScheduleContentStyle(
              getDecorationCaptionStyle(decoration),
            )}
          >
            <RichTextContent
              segments={getDecorationCaptionRichSegments(decoration)}
              fallback={decoration.caption}
            />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ===== 일정 카드 (Draggable + Droppable) =====
function ScheduleCard({
  sch,
  tags,
  isAdmin,
  showTime,
  showTimePlaceholder,
  showLeftColumn,
  single,
  dayOfWeek,
  draggable,
  isDragging,
  onLocalScheduleMutation,
  onScheduleSaved,
  onScheduleDeleted,
  onOpen,
}: {
  sch: Schedule;
  tags: ScheduleTag[];
  isAdmin: boolean;
  showTime: boolean;
  showTimePlaceholder: boolean;
  showLeftColumn: boolean;
  single: boolean;
  dayOfWeek: number;
  draggable: boolean;
  isDragging: boolean;
  onLocalScheduleMutation: () => void;
  onScheduleSaved: (schedule: Schedule, affectedSchedules?: Schedule[]) => void;
  onScheduleDeleted: (id: string) => void;
  onOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({
    id: sch.id,
    disabled: !draggable,
  });

  const hasContent = !!sch.content?.trim();
  const imageOnly = !hasContent && !!sch.image_url;
  const hasSideImage = Boolean(sch.image_url && !imageOnly);
  const transparentImageOnly = imageOnly && !sch.tag;
  const keepEmptyChipHeight = !hasContent;
  const displayTime = getScheduleDisplayTime(sch);
  const compactDisplayTime = getScheduleCompactDisplayTime(sch);
  const hasTimeNote = Boolean(sch.meta?.time_note?.trim());
  const venueLabel = sch.meta?.venue === "home" ? "H" : "A";
  const venueTitle = sch.meta?.venue === "home" ? "홈" : "원정";
  const hasCollabMembers = sch.collab_members?.length > 0;
  const hasMemo = Boolean(sch.memo?.trim());
  const showMemoIndicator = hasMemo && !sch.meta?.venue && !hasCollabMembers;
  const contentStyle = getScheduleContentStyle(sch.meta);
  const contentStyleOverrides = buildScheduleContentStyle(contentStyle);
  const contentRichSegments = getScheduleContentRichSegments(sch);
  const timeStyle = getScheduleTimeStyle(sch.meta);
  const timeStyleOverrides = buildScheduleTimeStyle(timeStyle);
  const canQuickEdit = draggable;
  const [editingField, setEditingField] = useState<"time" | "content" | null>(
    null,
  );
  const [draftValue, setDraftValue] = useState("");
  const [quickTagId, setQuickTagId] = useState(sch.tag_id || "");
  const [quickContentRichSegments, setQuickContentRichSegments] = useState<
    ScheduleRichTextSegment[]
  >([]);
  const [quickContentSelectionRange, setQuickContentSelectionRange] =
    useState<TextSelectionRange | null>(null);
  const [quickContentStyleOpen, setQuickContentStyleOpen] = useState(false);
  const [quickContentStyleScope, setQuickContentStyleScope] = useState<
    "selection" | "all"
  >("selection");
  const [quickContentStyleEnabled, setQuickContentStyleEnabled] =
    useState(false);
  const [quickContentFontWeight, setQuickContentFontWeight] = useState<
    "normal" | "bold"
  >("normal");
  const [quickContentIsItalic, setQuickContentIsItalic] = useState(false);
  const [quickContentIsUnderline, setQuickContentIsUnderline] = useState(false);
  const [quickContentIsStrikethrough, setQuickContentIsStrikethrough] =
    useState(false);
  const [quickContentFontSize, setQuickContentFontSize] = useState(14);
  const [quickContentFontSizePicker, setQuickContentFontSizePicker] =
    useState(14);
  const [quickContentTextAlign, setQuickContentTextAlign] = useState<
    "left" | "center" | "right"
  >("center");
  const [quickContentBgColor, setQuickContentBgColor] = useState("#ffffff");
  const [quickContentBgAlpha, setQuickContentBgAlpha] = useState(1);
  const [quickContentBgPickerColor, setQuickContentBgPickerColor] =
    useState("#ffffff");
  const [quickContentBgPickerAlpha, setQuickContentBgPickerAlpha] = useState(1);
  const [quickContentFontColor, setQuickContentFontColor] = useState("#333333");
  const [quickContentFontAlpha, setQuickContentFontAlpha] = useState(1);
  const [quickContentFontPickerColor, setQuickContentFontPickerColor] =
    useState("#333333");
  const [quickContentFontPickerAlpha, setQuickContentFontPickerAlpha] =
    useState(1);
  const [quickTimeStyleOpen, setQuickTimeStyleOpen] = useState(false);
  const [quickTimeStyleEnabled, setQuickTimeStyleEnabled] = useState(false);
  const [quickTimeFontWeight, setQuickTimeFontWeight] = useState<
    "normal" | "bold"
  >("normal");
  const [quickTimeIsItalic, setQuickTimeIsItalic] = useState(false);
  const [quickTimeIsUnderline, setQuickTimeIsUnderline] = useState(false);
  const [quickTimeIsStrikethrough, setQuickTimeIsStrikethrough] =
    useState(false);
  const [quickTimeFontSize, setQuickTimeFontSize] = useState(14);
  const [quickTimeTextAlign, setQuickTimeTextAlign] = useState<
    "left" | "center" | "right"
  >("center");
  const [quickTimeBgColor, setQuickTimeBgColor] = useState("#ffffff");
  const [quickTimeBgAlpha, setQuickTimeBgAlpha] = useState(0);
  const [quickTimeFontColor, setQuickTimeFontColor] = useState("#612DD4");
  const [quickTimeFontAlpha, setQuickTimeFontAlpha] = useState(1);
  const [quickTimeNote, setQuickTimeNote] = useState("");
  const [quickTimeNotePosition, setQuickTimeNotePosition] = useState<
    "before" | "after"
  >("before");
  const [quickTimeNoteGap, setQuickTimeNoteGap] = useState<1 | 2>(1);
  const [quickCollabMembers, setQuickCollabMembers] = useState("");
  const [quickMemo, setQuickMemo] = useState("");
  const [quickMemoPosition, setQuickMemoPosition] = useState<
    "before" | "after"
  >("after");
  const [quickMemoGap, setQuickMemoGap] = useState<1 | 2>(2);
  const [quickExtraOpen, setQuickExtraOpen] = useState(false);
  const [quickImageOpen, setQuickImageOpen] = useState(false);
  const [quickImageUrl, setQuickImageUrl] = useState<string | null>(null);
  const [quickImageUploading, setQuickImageUploading] = useState(false);
  const [quickImageError, setQuickImageError] = useState("");
  const [quickShowStickerPicker, setQuickShowStickerPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const scheduleCardRef = useRef<HTMLDivElement | null>(null);
  const quickEditPopoverRef = useRef<HTMLDivElement | null>(null);
  const quickContentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [quickEditPopoverPos, setQuickEditPopoverPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
    placement: "above" | "below";
  } | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setScheduleCardNodeRef = useCallback(
    (node: HTMLDivElement | null) => {
      scheduleCardRef.current = node;
      setSortableNodeRef(node);
    },
    [setSortableNodeRef],
  );

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const resetQuickContentStyleState = useCallback((tag?: ScheduleTag) => {
    const baseColors = getBaseScheduleContentColors(tag);
    setQuickContentStyleEnabled(false);
    setQuickContentFontWeight("normal");
    setQuickContentIsItalic(false);
    setQuickContentIsUnderline(false);
    setQuickContentIsStrikethrough(false);
    setQuickContentFontSize(14);
    setQuickContentFontSizePicker(14);
    setQuickContentTextAlign("center");
    setQuickContentBgColor(baseColors.bg.hex);
    setQuickContentBgAlpha(baseColors.bg.alpha);
    setQuickContentBgPickerColor(baseColors.bg.hex);
    setQuickContentBgPickerAlpha(baseColors.bg.alpha);
    setQuickContentFontColor(baseColors.fg.hex);
    setQuickContentFontAlpha(baseColors.fg.alpha);
    setQuickContentFontPickerColor(baseColors.fg.hex);
    setQuickContentFontPickerAlpha(baseColors.fg.alpha);
  }, []);

  const enableQuickContentStyle = useCallback(() => {
    if (quickContentStyleEnabled) return;
    const baseColors = getBaseScheduleContentColors(sch.tag);
    setQuickContentBgColor(baseColors.bg.hex);
    setQuickContentBgAlpha(baseColors.bg.alpha);
    setQuickContentBgPickerColor(baseColors.bg.hex);
    setQuickContentBgPickerAlpha(baseColors.bg.alpha);
    setQuickContentFontColor(baseColors.fg.hex);
    setQuickContentFontAlpha(baseColors.fg.alpha);
    setQuickContentFontPickerColor(baseColors.fg.hex);
    setQuickContentFontPickerAlpha(baseColors.fg.alpha);
    setQuickContentStyleEnabled(true);
  }, [quickContentStyleEnabled, sch.tag]);

  const loadQuickContentStyleState = useCallback(() => {
    const style = getScheduleContentStyle(sch.meta);
    if (!style) {
      resetQuickContentStyleState(sch.tag);
      return;
    }
    const baseColors = getBaseScheduleContentColors(sch.tag);
    const bg = parseColor(style.bg_color || baseColors.bg.hex);
    const fg = parseColor(style.font_color || baseColors.fg.hex);
    setQuickContentStyleEnabled(true);
    setQuickContentFontWeight(style.font_weight || "normal");
    setQuickContentIsItalic(Boolean(style.is_italic));
    setQuickContentIsUnderline(Boolean(style.is_underline));
    setQuickContentIsStrikethrough(Boolean(style.is_strikethrough));
    setQuickContentFontSize(
      typeof style.font_size === "number" && Number.isFinite(style.font_size)
        ? Math.max(8, Math.min(28, style.font_size))
        : 14,
    );
    setQuickContentFontSizePicker(
      typeof style.font_size === "number" && Number.isFinite(style.font_size)
        ? Math.max(8, Math.min(28, style.font_size))
        : 14,
    );
    setQuickContentTextAlign(
      style.text_align === "left" ||
        style.text_align === "right" ||
        style.text_align === "center"
        ? style.text_align
        : "center",
    );
    setQuickContentBgColor(bg.hex);
    setQuickContentBgAlpha(bg.alpha);
    setQuickContentBgPickerColor(bg.hex);
    setQuickContentBgPickerAlpha(bg.alpha);
    setQuickContentFontColor(fg.hex);
    setQuickContentFontAlpha(fg.alpha);
    setQuickContentFontPickerColor(fg.hex);
    setQuickContentFontPickerAlpha(fg.alpha);
  }, [resetQuickContentStyleState, sch.meta, sch.tag]);

  const resetQuickTimeStyleState = useCallback(() => {
    setQuickTimeStyleEnabled(false);
    setQuickTimeFontWeight("normal");
    setQuickTimeIsItalic(false);
    setQuickTimeIsUnderline(false);
    setQuickTimeIsStrikethrough(false);
    setQuickTimeFontSize(14);
    setQuickTimeTextAlign("center");
    setQuickTimeBgColor("#ffffff");
    setQuickTimeBgAlpha(0);
    setQuickTimeFontColor("#612DD4");
    setQuickTimeFontAlpha(1);
  }, []);

  const enableQuickTimeStyle = useCallback(() => {
    if (quickTimeStyleEnabled) return;
    setQuickTimeBgColor("#ffffff");
    setQuickTimeBgAlpha(0);
    setQuickTimeFontColor("#612DD4");
    setQuickTimeFontAlpha(1);
    setQuickTimeStyleEnabled(true);
  }, [quickTimeStyleEnabled]);

  const loadQuickTimeStyleState = useCallback(() => {
    const style = getScheduleTimeStyle(sch.meta);
    if (!style) {
      resetQuickTimeStyleState();
      return;
    }
    const bg = parseColor(style.bg_color || "#ffffff00");
    const fg = parseColor(style.font_color || "#612DD4");
    setQuickTimeStyleEnabled(true);
    setQuickTimeFontWeight(style.font_weight || "normal");
    setQuickTimeIsItalic(Boolean(style.is_italic));
    setQuickTimeIsUnderline(Boolean(style.is_underline));
    setQuickTimeIsStrikethrough(Boolean(style.is_strikethrough));
    setQuickTimeFontSize(
      typeof style.font_size === "number" && Number.isFinite(style.font_size)
        ? Math.max(8, Math.min(20, style.font_size))
        : 14,
    );
    setQuickTimeTextAlign(
      style.text_align === "left" ||
        style.text_align === "right" ||
        style.text_align === "center"
        ? style.text_align
        : "center",
    );
    setQuickTimeBgColor(bg.hex);
    setQuickTimeBgAlpha(bg.alpha);
    setQuickTimeFontColor(fg.hex);
    setQuickTimeFontAlpha(fg.alpha);
  }, [resetQuickTimeStyleState, sch.meta]);

  const loadQuickExtraState = useCallback(() => {
    const meta = sch.meta || {};
    setQuickTimeNote(meta.time_note || "");
    setQuickTimeNotePosition(
      meta.time_note_position === "after" ? "after" : "before",
    );
    setQuickTimeNoteGap(meta.time_note_gap === 2 ? 2 : 1);
    setQuickCollabMembers(sch.collab_members?.join(", ") || "");
    setQuickMemo(sch.memo || "");
    setQuickMemoPosition(meta.memo_position === "before" ? "before" : "after");
    setQuickMemoGap(meta.memo_gap === 1 ? 1 : 2);
  }, [sch.collab_members, sch.memo, sch.meta]);

  const uploadQuickImage = async (file: File) => {
    if (quickImageUploading) return;
    setQuickImageError("");
    setQuickImageUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setQuickImageError(data.error || "이미지 업로드 실패");
        return;
      }
      setQuickImageUrl(data.url);
      setQuickImageOpen(true);
    } catch {
      setQuickImageError("이미지 업로드 실패");
    } finally {
      setQuickImageUploading(false);
    }
  };

  useEffect(() => clearOpenTimer, [clearOpenTimer]);

  useEffect(() => {
    if (!contextMenu) return;

    const closeMenu = () => setContextMenu(null);
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [contextMenu]);

  const updateQuickEditPopoverPosition = useCallback(
    (field: "time" | "content" | null = editingField) => {
      const card = scheduleCardRef.current;
      if (!card || !field || typeof window === "undefined") return;
      const rect = card.getBoundingClientRect();
      const margin = 12;
      const width = Math.min(420, window.innerWidth - margin * 2);
      const measuredHeight = quickEditPopoverRef.current?.offsetHeight;
      const popoverHeight =
        measuredHeight && measuredHeight > 0
          ? measuredHeight
          : field === "time"
            ? 168
            : 248;
      const left = Math.max(
        margin,
        Math.min(
          rect.left + rect.width / 2 - width / 2,
          window.innerWidth - width - margin,
        ),
      );
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      const gap = 8;
      const showBelow = spaceBelow >= popoverHeight || spaceBelow >= spaceAbove;
      if (showBelow) {
        const top = Math.max(margin, rect.bottom + gap);
        setQuickEditPopoverPos({
          top,
          left,
          width,
          maxHeight: Math.max(180, window.innerHeight - top - margin),
          placement: "below",
        });
        return;
      }

      const bottom = Math.max(margin, window.innerHeight - rect.top + gap);
      setQuickEditPopoverPos({
        bottom,
        left,
        width,
        maxHeight: Math.max(180, rect.top - margin - gap),
        placement: "above",
      });
    },
    [editingField],
  );

  useEffect(() => {
    if (!editingField) return;
    updateQuickEditPopoverPosition(editingField);
    const frame = requestAnimationFrame(() =>
      updateQuickEditPopoverPosition(editingField),
    );

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (scheduleCardRef.current?.contains(target)) return;
      if (quickEditPopoverRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        (target.closest(".color-field-pop") ||
          target.closest(".sticker-picker-pop"))
      ) {
        return;
      }
      cancelInlineEdit();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelInlineEdit();
    };
    const handleReposition = () => updateQuickEditPopoverPosition(editingField);

    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [editingField, updateQuickEditPopoverPosition]);

  const startInlineEdit = (field: "time" | "content") => {
    if (!canQuickEdit || busy) return;
    clearOpenTimer();
    setContextMenu(null);
    setEditingField(field);
    setDraftValue(field === "time" ? sch.time || "" : sch.content || "");
    setQuickTagId(sch.tag_id || "");
    setQuickImageUrl(sch.image_url || null);
    setQuickImageError("");
    setQuickShowStickerPicker(false);
    setQuickContentStyleOpen(false);
    setQuickTimeStyleOpen(false);
    loadQuickExtraState();
    setQuickExtraOpen(Boolean(hasTimeNote || hasCollabMembers || hasMemo));
    setQuickImageOpen(field === "content" && Boolean(sch.image_url));
    if (field === "content") {
      loadQuickContentStyleState();
      setQuickContentRichSegments(getScheduleContentRichSegments(sch));
      setQuickContentSelectionRange(null);
      setQuickContentStyleScope("selection");
    }
    if (field === "time") loadQuickTimeStyleState();
    requestAnimationFrame(() => updateQuickEditPopoverPosition(field));
  };

  const cancelInlineEdit = () => {
    setEditingField(null);
    setDraftValue("");
    setQuickImageError("");
    setQuickShowStickerPicker(false);
    setQuickContentStyleOpen(false);
    setQuickTimeStyleOpen(false);
    setQuickExtraOpen(false);
    setQuickImageOpen(false);
    setQuickEditPopoverPos(null);
    setQuickContentSelectionRange(null);
  };

  const saveInlineEdit = async () => {
    if (!editingField || busy || quickImageUploading) return;

    const nextValue =
      editingField === "time"
        ? normalizeTime(draftValue) || null
        : draftValue.trim() || null;
    const currentValue =
      editingField === "time" ? sch.time || null : sch.content || null;
    const payload: Record<string, unknown> = {
      id: sch.id,
      [editingField]: nextValue,
    };
    const nextMeta: Schedule["meta"] = { ...(sch.meta || {}) };
    let quickChanged = false;

    if (editingField === "content") {
      if (quickContentStyleEnabled) {
        nextMeta.content_style = {
          font_weight: quickContentFontWeight,
          is_italic: quickContentIsItalic,
          is_underline: quickContentIsUnderline,
          is_strikethrough: quickContentIsStrikethrough,
          font_size: Math.max(8, Math.min(28, quickContentFontSize)),
          font_color: combineColor(
            quickContentFontColor,
            quickContentFontAlpha,
          ),
          bg_color: combineColor(quickContentBgColor, quickContentBgAlpha),
          text_align: quickContentTextAlign,
        };
      } else {
        delete nextMeta.content_style;
      }

      const currentStyle = getScheduleContentStyle(sch.meta);
      const nextStyle = getScheduleContentStyle(nextMeta);
      quickChanged =
        JSON.stringify(currentStyle ?? null) !==
        JSON.stringify(nextStyle ?? null);
      const nextRichSegments = normalizeRichTextSegments(
        quickContentRichSegments,
        draftValue.trim() || null,
      );
      const currentRichSegments = getScheduleContentRichSegments(sch);
      const richTextChanged =
        JSON.stringify(
          hasAnyRichTextStyle(currentRichSegments) ? currentRichSegments : [],
        ) !==
        JSON.stringify(
          hasAnyRichTextStyle(nextRichSegments) ? nextRichSegments : [],
        );
      if (hasAnyRichTextStyle(nextRichSegments)) {
        nextMeta.content_rich = nextRichSegments;
      } else {
        delete nextMeta.content_rich;
      }
      if (richTextChanged) {
        quickChanged = true;
      }
    }

    if (editingField === "time") {
      if (quickTimeStyleEnabled) {
        nextMeta.time_style = {
          font_weight: quickTimeFontWeight,
          is_italic: quickTimeIsItalic,
          is_underline: quickTimeIsUnderline,
          is_strikethrough: quickTimeIsStrikethrough,
          font_size: Math.max(8, Math.min(20, quickTimeFontSize)),
          font_color: combineColor(quickTimeFontColor, quickTimeFontAlpha),
          bg_color: combineColor(quickTimeBgColor, quickTimeBgAlpha),
          text_align: quickTimeTextAlign,
        };
      } else {
        delete nextMeta.time_style;
      }

      const currentStyle = getScheduleTimeStyle(sch.meta);
      const nextStyle = getScheduleTimeStyle(nextMeta);
      quickChanged =
        JSON.stringify(currentStyle ?? null) !==
        JSON.stringify(nextStyle ?? null);
    }

    const nextTimeNote = quickTimeNote.trim();
    if (nextTimeNote) {
      nextMeta.time_note = nextTimeNote;
      nextMeta.time_note_position = quickTimeNotePosition;
      nextMeta.time_note_gap = quickTimeNoteGap;
    } else {
      delete nextMeta.time_note;
      delete nextMeta.time_note_position;
      delete nextMeta.time_note_gap;
    }

    const nextMemo = quickMemo.trim() || null;
    const nextCollabMembers = quickCollabMembers
      .split(",")
      .map((member) => member.trim())
      .filter(Boolean);
    if (nextMemo) {
      nextMeta.memo_position = quickMemoPosition;
      nextMeta.memo_gap = quickMemoGap;
    } else {
      delete nextMeta.memo_position;
      delete nextMeta.memo_gap;
    }

    if (JSON.stringify(sch.meta || {}) !== JSON.stringify(nextMeta)) {
      quickChanged = true;
      payload.meta = nextMeta;
    }

    if ((sch.memo || null) !== nextMemo) {
      quickChanged = true;
      payload.memo = nextMemo;
    }

    if (
      JSON.stringify(sch.collab_members || []) !==
      JSON.stringify(nextCollabMembers)
    ) {
      quickChanged = true;
      payload.collab_members = nextCollabMembers;
    }
    if ((sch.tag_id || "") !== quickTagId) {
      quickChanged = true;
      payload.tag_id = quickTagId || null;
    }
    if (
      editingField === "content" &&
      (sch.image_url || null) !== quickImageUrl
    ) {
      quickChanged = true;
      payload.image_url = quickImageUrl;
    }

    if (nextValue === currentValue && !quickChanged) {
      cancelInlineEdit();
      return;
    }

    setBusy(true);
    try {
      onLocalScheduleMutation();
      const res = await fetch("/api/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.schedule) {
        alert(data.error || "일정 수정에 실패했습니다.");
        return;
      }
      onScheduleSaved(data.schedule as Schedule);
      cancelInlineEdit();
    } finally {
      setBusy(false);
    }
  };

  const deleteSchedule = async () => {
    if (!canQuickEdit || busy) return;
    setContextMenu(null);

    setBusy(true);
    try {
      onLocalScheduleMutation();
      const res = await fetch(`/api/schedule?id=${sch.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "일정 삭제에 실패했습니다.");
        return;
      }
      setShowDeleteDialog(false);
      onScheduleDeleted(sch.id);
    } finally {
      setBusy(false);
    }
  };

  const handleInlineKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelInlineEdit();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      saveInlineEdit();
    }
  };

  const openContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!canQuickEdit) return;
    clearOpenTimer();
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  const scheduleTooltipInfoLines = [
    sch.meta?.venue ? venueTitle : "",
    hasCollabMembers ? `w. ${sch.collab_members.join(", ")}` : "",
  ].filter(Boolean);
  const scheduleMemo = sch.memo?.trim() || "";
  const scheduleInfoText = scheduleTooltipInfoLines.join("\n");
  const memoPosition = sch.meta?.memo_position ?? "after";
  const memoGap = sch.meta?.memo_gap ?? 2;
  const memoSeparator = "\n".repeat(memoGap); // gap=1 → "\n", gap=2 → "\n\n"
  const scheduleTooltipText =
    scheduleInfoText && scheduleMemo
      ? memoPosition === "before"
        ? `${scheduleMemo}${memoSeparator}${scheduleInfoText}`
        : `${scheduleInfoText}${memoSeparator}${scheduleMemo}`
      : scheduleMemo || scheduleInfoText;
  const scheduleTooltipPositionClass =
    dayOfWeek === 0
      ? "left-0 translate-y-1 md:group-hover:translate-y-0"
      : dayOfWeek === 6
        ? "right-0 translate-y-1 md:group-hover:translate-y-0"
        : "left-1/2 -translate-x-1/2 translate-y-1 md:group-hover:translate-y-0";

  const handleCardClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (isDragging || editingField) {
      event.stopPropagation();
      return;
    }

    if (!canQuickEdit) return;

    event.stopPropagation();
    clearOpenTimer();
    openTimerRef.current = setTimeout(() => {
      openTimerRef.current = null;
      onOpen();
    }, 180);
  };

  const getQuickContentStyleRange = (
    scope: "selection" | "all" = quickContentStyleScope,
    rangeOverride?: TextSelectionRange | null,
  ): TextSelectionRange | null => {
    if (scope === "all") {
      return draftValue.length ? { start: 0, end: draftValue.length } : null;
    }
    return rangeOverride !== undefined
      ? rangeOverride
      : (quickContentSelectionRange ??
          getTextareaSelection(quickContentTextareaRef.current));
  };

  const applyQuickContentRichStyle = (patch: ScheduleRichTextStyle) => {
    const textarea = quickContentTextareaRef.current;
    const range = getQuickContentStyleRange();
    if (!range) return false;
    setQuickContentRichSegments((segments) =>
      applyRichStyleToSelection(segments, draftValue, range, patch),
    );
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(range.start, range.end);
    });
    return true;
  };

  const syncQuickContentPickerToWholeStyle = (
    scope = quickContentStyleScope,
    rangeOverride?: TextSelectionRange | null,
  ) => {
    const range = getQuickContentStyleRange(scope, rangeOverride);
    const baseColors = getBaseScheduleContentColors(sch.tag);
    const wholeBg = quickContentStyleEnabled
      ? { hex: quickContentBgColor, alpha: quickContentBgAlpha }
      : baseColors.bg;
    const wholeFg = quickContentStyleEnabled
      ? { hex: quickContentFontColor, alpha: quickContentFontAlpha }
      : baseColors.fg;
    const bg = getRichSelectionColor(
      quickContentRichSegments,
      draftValue,
      range,
      "bg_color",
      wholeBg,
    );
    const fg = getRichSelectionColor(
      quickContentRichSegments,
      draftValue,
      range,
      "font_color",
      wholeFg,
    );
    const fontSize = getRichSelectionFontSize(
      quickContentRichSegments,
      draftValue,
      range,
      quickContentStyleEnabled ? quickContentFontSize : 14,
    );
    setQuickContentBgPickerColor(bg.hex);
    setQuickContentBgPickerAlpha(bg.alpha);
    setQuickContentFontPickerColor(fg.hex);
    setQuickContentFontPickerAlpha(fg.alpha);
    setQuickContentFontSizePicker(fontSize);
  };

  const updateQuickContentSelection = () => {
    const range = getTextareaSelection(quickContentTextareaRef.current);
    setQuickContentSelectionRange(range);
    if (range) setQuickContentStyleScope("selection");
    requestAnimationFrame(() =>
      syncQuickContentPickerToWholeStyle(
        range ? "selection" : quickContentStyleScope,
        range,
      ),
    );
  };

  const renderInlineEditActions = () => (
    <div className="flex items-center justify-center gap-2 pt-1">
      <button
        type="button"
        disabled={busy}
        title="Enter로도 저장할 수 있습니다"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          saveInlineEdit();
        }}
        className="min-w-14 rounded-lg bg-dunggeure-primary px-3 py-1.5 text-xs font-bold leading-none text-white shadow-sm transition hover:bg-dunggeure-dark disabled:opacity-50"
      >
        저장
      </button>
      <button
        type="button"
        disabled={busy}
        title="Esc로도 취소할 수 있습니다"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          cancelInlineEdit();
        }}
        className="min-w-14 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-bold leading-none text-[var(--text-secondary)] shadow-sm ring-1 ring-dunggeure-light/70 transition hover:bg-dunggeure-lighter/30 disabled:opacity-50"
      >
        취소
      </button>
    </div>
  );

  const renderQuickStyleToggle = (
    label: string,
    open: boolean,
    onToggle: () => void,
  ) => (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] transition hover:border-dunggeure-light hover:text-dunggeure-primary"
    >
      <span>{label}</span>
      <ChevronDown
        size={14}
        className={`transition-transform ${open ? "rotate-180" : ""}`}
      />
    </button>
  );

  const renderQuickTagControls = () => {
    if (!tags.length) return null;

    return (
      <div className="space-y-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2">
        <div className="text-xs font-bold text-[var(--text-secondary)]">
          태그
        </div>
        <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto px-1 py-1">
          <button
            type="button"
            onClick={() => setQuickTagId("")}
            aria-pressed={!quickTagId}
            className={`relative rounded-md border px-2 py-1 text-[11px] font-medium leading-none transition ${
              !quickTagId
                ? "border-transparent bg-[var(--text-secondary)] text-white ring-2 ring-dunggeure-primary/40"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-dunggeure-light hover:text-dunggeure-primary"
            }`}
          >
            태그 없음
          </button>
          {tags.map((tag) => {
            const selected = quickTagId === tag.id;
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => setQuickTagId(selected ? "" : tag.id)}
                aria-pressed={selected}
                className={`relative rounded-md border px-2 py-1 text-[11px] font-medium leading-none transition ${
                  selected
                    ? "border-transparent ring-2 ring-dunggeure-primary/50 shadow"
                    : "border-[var(--border)] hover:border-dunggeure-light"
                }`}
                style={buildScheduleTagStyle(tag)}
              >
                {tag.name}
                {selected && (
                  <span
                    aria-hidden
                    className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white shadow"
                  >
                    <Check size={9} strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderQuickExtraInfoControls = () => {
    const hasQuickMemoContext =
      quickCollabMembers
        .split(",")
        .map((member) => member.trim())
        .filter(Boolean).length > 0;

    return (
      <div className="space-y-2 border-t border-dunggeure-light/60 pt-2">
        {hasTimeNote && (
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[var(--text-secondary)]">
              부가 시간 정보
            </label>
            <input
              type="text"
              value={quickTimeNote}
              onChange={(event) => setQuickTimeNote(event.target.value)}
              placeholder="예: 설연휴"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs outline-none transition focus:border-dunggeure-primary"
            />
            {quickTimeNote.trim() && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-secondary)]">
                <span className="font-medium">위치</span>
                <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg)] p-0.5">
                  {[
                    { v: "before" as const, label: "시간 위" },
                    { v: "after" as const, label: "시간 아래" },
                  ].map((option) => (
                    <button
                      key={option.v}
                      type="button"
                      onClick={() => setQuickTimeNotePosition(option.v)}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                        quickTimeNotePosition === option.v
                          ? "bg-dunggeure-primary text-white shadow-sm"
                          : "text-[var(--text-secondary)] hover:bg-dunggeure-lighter/30 hover:text-dunggeure-primary"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <span className="font-medium">빈 줄</span>
                <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg)] p-0.5">
                  {([1, 2] as const).map((gap) => (
                    <button
                      key={gap}
                      type="button"
                      onClick={() => setQuickTimeNoteGap(gap)}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                        quickTimeNoteGap === gap
                          ? "bg-dunggeure-primary text-white shadow-sm"
                          : "text-[var(--text-secondary)] hover:bg-dunggeure-lighter/30 hover:text-dunggeure-primary"
                      }`}
                    >
                      {gap}줄
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {hasCollabMembers && (
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[var(--text-secondary)]">
              합방 멤버
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-dunggeure-primary">
                w.
              </span>
              <input
                type="text"
                value={quickCollabMembers}
                onChange={(event) =>
                  setQuickCollabMembers(
                    normalizeCollabMembersInput(event.target.value),
                  )
                }
                placeholder="쉼표로 구분"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] py-2 pl-8 pr-3 text-xs outline-none transition focus:border-dunggeure-primary"
              />
            </div>
          </div>
        )}
        {hasMemo && (
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[var(--text-secondary)]">
              메모
            </label>
            <textarea
              value={quickMemo}
              onChange={(event) => setQuickMemo(event.target.value)}
              placeholder="툴팁에 표시할 메모"
              rows={2}
              className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs outline-none transition focus:border-dunggeure-primary"
            />
            {quickMemo.trim() && hasQuickMemoContext && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-secondary)]">
                <span className="font-medium">툴팁 위치</span>
                <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg)] p-0.5">
                  {[
                    { v: "before" as const, label: "메모 앞" },
                    { v: "after" as const, label: "메모 뒤" },
                  ].map((option) => (
                    <button
                      key={option.v}
                      type="button"
                      onClick={() => setQuickMemoPosition(option.v)}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                        quickMemoPosition === option.v
                          ? "bg-dunggeure-primary text-white shadow-sm"
                          : "text-[var(--text-secondary)] hover:bg-dunggeure-lighter/30 hover:text-dunggeure-primary"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <span className="font-medium">빈 줄</span>
                <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg)] p-0.5">
                  {([1, 2] as const).map((gap) => (
                    <button
                      key={gap}
                      type="button"
                      onClick={() => setQuickMemoGap(gap)}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                        quickMemoGap === gap
                          ? "bg-dunggeure-primary text-white shadow-sm"
                          : "text-[var(--text-secondary)] hover:bg-dunggeure-lighter/30 hover:text-dunggeure-primary"
                      }`}
                    >
                      {gap}줄
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderQuickImageControls = () => (
    <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-[var(--text-secondary)]">
          이미지
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <label
            className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border border-dunggeure-primary px-2 py-1 text-[11px] font-medium text-dunggeure-primary transition hover:bg-dunggeure-lighter/30 ${
              quickImageUploading ? "cursor-not-allowed opacity-50" : ""
            }`}
          >
            <Plus size={11} />
            {quickImageUrl ? "변경" : "추가"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={quickImageUploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) uploadQuickImage(file);
                event.target.value = "";
              }}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={() => setQuickShowStickerPicker(true)}
            disabled={quickImageUploading}
            className="inline-flex items-center rounded-lg border border-dunggeure-primary px-2 py-1 text-[11px] font-medium text-dunggeure-primary transition hover:bg-dunggeure-lighter/30 disabled:opacity-50"
          >
            스티커
          </button>
        </div>
      </div>
      {quickImageUploading && (
        <p className="text-[11px] text-[var(--text-secondary)]">업로드 중...</p>
      )}
      {quickImageError && (
        <p className="rounded-lg bg-red-50 px-2 py-1 text-[11px] text-red-600">
          {quickImageError}
        </p>
      )}
      <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)]">
        {quickImageUrl ? (
          <>
            <img
              src={quickImageUrl}
              alt="첨부 이미지"
              className="max-h-full max-w-full object-contain"
            />
            <button
              type="button"
              onClick={() => setQuickImageUrl(null)}
              className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500/90 text-white shadow transition hover:bg-red-600"
              aria-label="이미지 제거"
            >
              <X size={8} />
            </button>
          </>
        ) : (
          <span className="text-[10px] text-[var(--text-secondary)]">
            미리보기
          </span>
        )}
      </div>
    </div>
  );

  const renderQuickContentStyleControls = () => {
    const baseColors = getBaseScheduleContentColors(sch.tag);
    const visibleBgColor = {
      hex: quickContentBgPickerColor,
      alpha: quickContentBgPickerAlpha,
    };
    const visibleFontColor = {
      hex: quickContentFontPickerColor,
      alpha: quickContentFontPickerAlpha,
    };
    const quickContentTextareaSelectionRange = quickContentSelectionRange;
    const selectedRange = getQuickContentStyleRange();
    const boldPressed = selectedRange
      ? selectedRangeHasRichStyle(
          quickContentRichSegments,
          draftValue,
          selectedRange,
          "font_weight",
          "bold",
        )
      : quickContentStyleEnabled && quickContentFontWeight === "bold";
    const italicPressed = selectedRange
      ? selectedRangeHasRichStyle(
          quickContentRichSegments,
          draftValue,
          selectedRange,
          "is_italic",
          true,
        )
      : quickContentStyleEnabled && quickContentIsItalic;
    const underlinePressed = selectedRange
      ? selectedRangeHasRichStyle(
          quickContentRichSegments,
          draftValue,
          selectedRange,
          "is_underline",
          true,
        )
      : quickContentStyleEnabled && quickContentIsUnderline;
    const strikethroughPressed = selectedRange
      ? selectedRangeHasRichStyle(
          quickContentRichSegments,
          draftValue,
          selectedRange,
          "is_strikethrough",
          true,
        )
      : quickContentStyleEnabled && quickContentIsStrikethrough;
    const activeButtonClass =
      "border-dunggeure-primary bg-dunggeure-primary text-white";
    const inactiveButtonClass =
      "border-[var(--border)] bg-[var(--bg)] hover:border-dunggeure-light";

    return (
      <div className="space-y-2 border-t border-dunggeure-light/60 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--text-secondary)]">
              내용 스타일
            </span>
            <div className="flex rounded-lg bg-[var(--bg-secondary)] p-0.5">
              {(
                [
                  ["selection", "선택영역"],
                  ["all", "전체내용"],
                ] as const
              ).map(([scope, label]) => (
                <button
                  key={scope}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setQuickContentStyleScope(scope);
                    requestAnimationFrame(() =>
                      syncQuickContentPickerToWholeStyle(scope),
                    );
                  }}
                  disabled={
                    scope === "selection" && !quickContentTextareaSelectionRange
                  }
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition disabled:opacity-40 ${
                    quickContentStyleScope === scope
                      ? "bg-dunggeure-primary text-white"
                      : "text-[var(--text-secondary)] hover:text-dunggeure-primary"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => resetQuickContentStyleState(sch.tag)}
            className="rounded-lg px-2 py-1 text-xs text-[var(--text-secondary)] transition hover:bg-dunggeure-lighter/30 hover:text-dunggeure-primary"
          >
            태그 스타일 사용
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const range = getQuickContentStyleRange();
              if (range) {
                const active = selectedRangeHasRichStyle(
                  quickContentRichSegments,
                  draftValue,
                  range,
                  "font_weight",
                  "bold",
                );
                applyQuickContentRichStyle({
                  font_weight: active ? undefined : "bold",
                });
                return;
              }
              enableQuickContentStyle();
              setQuickContentFontWeight((value) =>
                value === "bold" ? "normal" : "bold",
              );
            }}
            className={`flex h-7 w-7 items-center justify-center rounded-lg border text-xs font-bold transition ${
              boldPressed ? activeButtonClass : inactiveButtonClass
            }`}
            aria-label="굵게"
            aria-pressed={boldPressed}
          >
            B
          </button>
          <button
            type="button"
            onClick={() => {
              const range = getQuickContentStyleRange();
              if (range) {
                const active = selectedRangeHasRichStyle(
                  quickContentRichSegments,
                  draftValue,
                  range,
                  "is_italic",
                  true,
                );
                applyQuickContentRichStyle({
                  is_italic: active ? undefined : true,
                });
                return;
              }
              enableQuickContentStyle();
              setQuickContentIsItalic((value) => !value);
            }}
            className={`flex h-7 w-7 items-center justify-center rounded-lg border text-xs italic transition ${
              italicPressed ? activeButtonClass : inactiveButtonClass
            }`}
            aria-label="기울임"
            aria-pressed={italicPressed}
          >
            I
          </button>
          <button
            type="button"
            onClick={() => {
              const range = getQuickContentStyleRange();
              if (range) {
                const active = selectedRangeHasRichStyle(
                  quickContentRichSegments,
                  draftValue,
                  range,
                  "is_underline",
                  true,
                );
                applyQuickContentRichStyle({
                  is_underline: active ? undefined : true,
                });
                return;
              }
              enableQuickContentStyle();
              setQuickContentIsUnderline((value) => !value);
            }}
            className={`flex h-7 w-7 items-center justify-center rounded-lg border text-xs underline transition ${
              underlinePressed ? activeButtonClass : inactiveButtonClass
            }`}
            aria-label="밑줄"
            aria-pressed={underlinePressed}
          >
            U
          </button>
          <button
            type="button"
            onClick={() => {
              const range = getQuickContentStyleRange();
              if (range) {
                const active = selectedRangeHasRichStyle(
                  quickContentRichSegments,
                  draftValue,
                  range,
                  "is_strikethrough",
                  true,
                );
                applyQuickContentRichStyle({
                  is_strikethrough: active ? undefined : true,
                });
                return;
              }
              enableQuickContentStyle();
              setQuickContentIsStrikethrough((value) => !value);
            }}
            className={`flex h-7 w-7 items-center justify-center rounded-lg border text-xs line-through transition ${
              strikethroughPressed ? activeButtonClass : inactiveButtonClass
            }`}
            aria-label="취소선"
            aria-pressed={strikethroughPressed}
          >
            S
          </button>
          <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
            크기
            <input
              type="number"
              min={8}
              max={28}
              value={quickContentFontSizePicker}
              onChange={(event) => {
                const nextFontSize = Math.max(
                  8,
                  Math.min(28, Number(event.target.value) || 14),
                );
                setQuickContentFontSizePicker(nextFontSize);
                if (
                  applyQuickContentRichStyle({
                    font_size: nextFontSize,
                  })
                ) {
                  return;
                }
                enableQuickContentStyle();
                setQuickContentFontSize(nextFontSize);
              }}
              className="h-7 w-14 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-xs outline-none transition focus:border-dunggeure-primary"
            />
          </label>
          <div className="flex items-center gap-1">
            {(
              [
                { value: "left", label: "왼쪽 정렬", icon: AlignLeft },
                { value: "center", label: "가운데 정렬", icon: AlignCenter },
                { value: "right", label: "오른쪽 정렬", icon: AlignRight },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  enableQuickContentStyle();
                  setQuickContentTextAlign(value);
                }}
                className={`flex h-7 w-7 items-center justify-center rounded-lg border transition ${
                  quickContentStyleEnabled && quickContentTextAlign === value
                    ? activeButtonClass
                    : inactiveButtonClass
                }`}
                aria-label={label}
                aria-pressed={
                  quickContentStyleEnabled && quickContentTextAlign === value
                }
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ColorField
            label="내용 배경색"
            hex={visibleBgColor.hex}
            alpha={visibleBgColor.alpha}
            onChange={(hex, alpha) => {
              setQuickContentBgPickerColor(hex);
              setQuickContentBgPickerAlpha(alpha);
              if (
                applyQuickContentRichStyle({
                  bg_color: combineColor(hex, alpha),
                })
              ) {
                return;
              }
              enableQuickContentStyle();
              setQuickContentBgColor(hex);
              setQuickContentBgAlpha(alpha);
            }}
            onReset={() => {
              setQuickContentBgPickerColor(baseColors.bg.hex);
              setQuickContentBgPickerAlpha(baseColors.bg.alpha);
              if (applyQuickContentRichStyle({ bg_color: undefined })) {
                return;
              }
              enableQuickContentStyle();
              setQuickContentBgColor(baseColors.bg.hex);
              setQuickContentBgAlpha(baseColors.bg.alpha);
            }}
          />
          <ColorField
            label="내용 폰트색"
            hex={visibleFontColor.hex}
            alpha={visibleFontColor.alpha}
            onChange={(hex, alpha) => {
              setQuickContentFontPickerColor(hex);
              setQuickContentFontPickerAlpha(alpha);
              if (
                applyQuickContentRichStyle({
                  font_color: combineColor(hex, alpha),
                })
              ) {
                return;
              }
              enableQuickContentStyle();
              setQuickContentFontColor(hex);
              setQuickContentFontAlpha(alpha);
            }}
            onReset={() => {
              setQuickContentFontPickerColor(baseColors.fg.hex);
              setQuickContentFontPickerAlpha(baseColors.fg.alpha);
              if (applyQuickContentRichStyle({ font_color: undefined })) {
                return;
              }
              enableQuickContentStyle();
              setQuickContentFontColor(baseColors.fg.hex);
              setQuickContentFontAlpha(baseColors.fg.alpha);
            }}
          />
        </div>
        <div
          className="rounded-lg px-3 py-2 text-sm"
          style={{
            backgroundColor: quickContentStyleEnabled
              ? combineColor(quickContentBgColor, quickContentBgAlpha)
              : sch.tag?.bg_color || "transparent",
            color: quickContentStyleEnabled
              ? combineColor(quickContentFontColor, quickContentFontAlpha)
              : sch.tag?.font_color || "var(--text)",
            fontWeight: quickContentStyleEnabled
              ? quickContentFontWeight
              : "bold",
            fontStyle:
              quickContentStyleEnabled && quickContentIsItalic
                ? "italic"
                : "normal",
            textDecoration: quickContentStyleEnabled
              ? [
                  quickContentIsUnderline && "underline",
                  quickContentIsStrikethrough && "line-through",
                ]
                  .filter(Boolean)
                  .join(" ") || "none"
              : "none",
            fontSize: quickContentStyleEnabled
              ? `${Math.max(8, Math.min(28, quickContentFontSize))}px`
              : undefined,
            textAlign: quickContentStyleEnabled
              ? quickContentTextAlign
              : "center",
          }}
        >
          <RichTextContent
            segments={quickContentRichSegments}
            fallback={draftValue.trim() || "미리보기 텍스트"}
          />
        </div>
      </div>
    );
  };

  const renderQuickTimeStyleControls = () => {
    const visibleBgColor = quickTimeStyleEnabled
      ? { hex: quickTimeBgColor, alpha: quickTimeBgAlpha }
      : { hex: "#ffffff", alpha: 0 };
    const visibleFontColor = quickTimeStyleEnabled
      ? { hex: quickTimeFontColor, alpha: quickTimeFontAlpha }
      : { hex: "#612DD4", alpha: 1 };
    const activeButtonClass =
      "border-dunggeure-primary bg-dunggeure-primary text-white";
    const inactiveButtonClass =
      "border-[var(--border)] bg-[var(--bg)] hover:border-dunggeure-light";

    return (
      <div className="space-y-2 border-t border-dunggeure-light/60 pt-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-[var(--text-secondary)]">
            시간 스타일
          </span>
          <button
            type="button"
            onClick={resetQuickTimeStyleState}
            className="rounded-lg px-2 py-1 text-xs text-[var(--text-secondary)] transition hover:bg-dunggeure-lighter/30 hover:text-dunggeure-primary"
          >
            기본 스타일 사용
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              enableQuickTimeStyle();
              setQuickTimeFontWeight((value) =>
                value === "bold" ? "normal" : "bold",
              );
            }}
            className={`flex h-7 w-7 items-center justify-center rounded-lg border text-xs font-bold transition ${
              quickTimeStyleEnabled && quickTimeFontWeight === "bold"
                ? activeButtonClass
                : inactiveButtonClass
            }`}
            aria-label="굵게"
            aria-pressed={
              quickTimeStyleEnabled && quickTimeFontWeight === "bold"
            }
          >
            B
          </button>
          <button
            type="button"
            onClick={() => {
              enableQuickTimeStyle();
              setQuickTimeIsItalic((value) => !value);
            }}
            className={`flex h-7 w-7 items-center justify-center rounded-lg border text-xs italic transition ${
              quickTimeStyleEnabled && quickTimeIsItalic
                ? activeButtonClass
                : inactiveButtonClass
            }`}
            aria-label="기울임"
            aria-pressed={quickTimeStyleEnabled && quickTimeIsItalic}
          >
            I
          </button>
          <button
            type="button"
            onClick={() => {
              enableQuickTimeStyle();
              setQuickTimeIsUnderline((value) => !value);
            }}
            className={`flex h-7 w-7 items-center justify-center rounded-lg border text-xs underline transition ${
              quickTimeStyleEnabled && quickTimeIsUnderline
                ? activeButtonClass
                : inactiveButtonClass
            }`}
            aria-label="밑줄"
            aria-pressed={quickTimeStyleEnabled && quickTimeIsUnderline}
          >
            U
          </button>
          <button
            type="button"
            onClick={() => {
              enableQuickTimeStyle();
              setQuickTimeIsStrikethrough((value) => !value);
            }}
            className={`flex h-7 w-7 items-center justify-center rounded-lg border text-xs line-through transition ${
              quickTimeStyleEnabled && quickTimeIsStrikethrough
                ? activeButtonClass
                : inactiveButtonClass
            }`}
            aria-label="취소선"
            aria-pressed={quickTimeStyleEnabled && quickTimeIsStrikethrough}
          >
            S
          </button>
          <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
            크기
            <input
              type="number"
              min={8}
              max={20}
              value={quickTimeFontSize}
              onChange={(event) => {
                enableQuickTimeStyle();
                setQuickTimeFontSize(Number(event.target.value) || 14);
              }}
              className="h-7 w-14 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-xs outline-none transition focus:border-dunggeure-primary"
            />
          </label>
          <div className="flex items-center gap-1">
            {(
              [
                { value: "left", label: "왼쪽 정렬", icon: AlignLeft },
                { value: "center", label: "가운데 정렬", icon: AlignCenter },
                { value: "right", label: "오른쪽 정렬", icon: AlignRight },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  enableQuickTimeStyle();
                  setQuickTimeTextAlign(value);
                }}
                className={`flex h-7 w-7 items-center justify-center rounded-lg border transition ${
                  quickTimeStyleEnabled && quickTimeTextAlign === value
                    ? activeButtonClass
                    : inactiveButtonClass
                }`}
                aria-label={label}
                aria-pressed={
                  quickTimeStyleEnabled && quickTimeTextAlign === value
                }
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ColorField
            label="시간 배경색"
            hex={visibleBgColor.hex}
            alpha={visibleBgColor.alpha}
            onChange={(hex, alpha) => {
              enableQuickTimeStyle();
              setQuickTimeBgColor(hex);
              setQuickTimeBgAlpha(alpha);
            }}
            onReset={() => {
              enableQuickTimeStyle();
              setQuickTimeBgColor("#ffffff");
              setQuickTimeBgAlpha(0);
            }}
          />
          <ColorField
            label="시간 폰트색"
            hex={visibleFontColor.hex}
            alpha={visibleFontColor.alpha}
            onChange={(hex, alpha) => {
              enableQuickTimeStyle();
              setQuickTimeFontColor(hex);
              setQuickTimeFontAlpha(alpha);
            }}
            onReset={() => {
              enableQuickTimeStyle();
              setQuickTimeFontColor("#612DD4");
              setQuickTimeFontAlpha(1);
            }}
          />
        </div>
        <div
          className="rounded-lg px-3 py-2 text-sm"
          style={{
            backgroundColor: quickTimeStyleEnabled
              ? combineColor(quickTimeBgColor, quickTimeBgAlpha)
              : "transparent",
            color: quickTimeStyleEnabled
              ? combineColor(quickTimeFontColor, quickTimeFontAlpha)
              : "#612DD4",
            fontWeight: quickTimeStyleEnabled ? quickTimeFontWeight : "bold",
            fontStyle:
              quickTimeStyleEnabled && quickTimeIsItalic ? "italic" : "normal",
            textDecoration: quickTimeStyleEnabled
              ? [
                  quickTimeIsUnderline && "underline",
                  quickTimeIsStrikethrough && "line-through",
                ]
                  .filter(Boolean)
                  .join(" ") || "none"
              : "none",
            fontSize: quickTimeStyleEnabled
              ? `${Math.max(8, Math.min(20, quickTimeFontSize))}px`
              : undefined,
            textAlign: quickTimeStyleEnabled ? quickTimeTextAlign : "center",
          }}
        >
          {draftValue.trim() || "예: 7PM"}
        </div>
      </div>
    );
  };

  return (
    <>
      <div
        ref={setScheduleCardNodeRef}
        data-schedule-card-id={sch.id}
        onClick={handleCardClick}
        onDoubleClick={(e) => {
          if (!canQuickEdit) return;
          e.preventDefault();
          e.stopPropagation();
          clearOpenTimer();
          startInlineEdit("content");
        }}
        onContextMenu={openContextMenu}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.4 : busy ? 0.6 : 1,
        }}
        className={`group relative flex w-full min-w-0 select-none flex-col items-stretch justify-center gap-0.5 text-center text-[10px] font-bold leading-[1.15] outline-none ring-0 md:flex-row md:gap-0.5 md:text-sm md:leading-tight focus:outline-none focus:ring-0 focus-visible:outline-none ${single ? "min-h-0 flex-1" : ""}`}
      >
        {draggable && !editingField && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            onClick={(event) => event.stopPropagation()}
            className="absolute left-0 top-0 z-10 hidden h-4 w-4 touch-none cursor-grab items-center justify-center rounded bg-black/45 text-white opacity-0 shadow transition hover:bg-black/65 active:cursor-grabbing group-hover:flex group-hover:opacity-100 md:h-5 md:w-5"
            aria-label="일정 이동"
          >
            <GripVertical size={10} />
          </button>
        )}
        {showLeftColumn &&
          (showTime ||
            hasTimeNote ||
            showTimePlaceholder ||
            editingField === "time" ||
            hasSideImage) && (
            <div className="flex w-full min-w-0 shrink-0 flex-col items-center justify-center gap-0.5 md:w-14 md:min-w-14 md:max-w-14">
              {(showTime || hasTimeNote) && displayTime && (
                <>
                  <span
                    onDoubleClick={(event) => {
                      if (!canQuickEdit) return;
                      event.preventDefault();
                      event.stopPropagation();
                      startInlineEdit("time");
                    }}
                    className="hidden max-w-full whitespace-pre-line rounded px-0.5 text-center font-bold leading-tight text-dunggeure-primary max-[320px]:inline-block"
                    style={{
                      ...timeStyleOverrides,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {compactDisplayTime}
                  </span>
                  <span
                    onDoubleClick={(event) => {
                      if (!canQuickEdit) return;
                      event.preventDefault();
                      event.stopPropagation();
                      startInlineEdit("time");
                    }}
                    className="block max-w-full whitespace-normal break-keep rounded px-0.5 text-center font-bold leading-tight text-dunggeure-primary max-[320px]:hidden"
                    style={{
                      ...timeStyleOverrides,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {displayTime}
                  </span>
                </>
              )}
              {showTimePlaceholder && (
                <span className="font-bold leading-none text-dunggeure-primary">
                  -
                </span>
              )}
              {hasSideImage && (
                <div className="flex h-8 w-full max-w-12 items-center justify-center overflow-hidden md:h-9">
                  <LoadingImage
                    src={sch.image_url || ""}
                    alt=""
                    wrapperClassName="h-full w-full items-center justify-center rounded"
                    skeletonClassName="rounded"
                    className="max-h-full max-w-full object-contain rounded"
                  />
                </div>
              )}
            </div>
          )}
        <div
          className={`relative flex min-w-0 flex-1 self-stretch items-center justify-center rounded px-0.5 py-0.5 ${
            keepEmptyChipHeight ? "min-h-[22px]" : ""
          } ${imageOnly ? "min-h-[42px] md:min-h-[56px]" : ""}`}
          style={{
            ...buildScheduleTagBorderStyle(
              transparentImageOnly ? null : sch.tag,
            ),
            backgroundColor: transparentImageOnly
              ? "transparent"
              : contentStyle?.bg_color || sch.tag?.bg_color || "transparent",
            color:
              contentStyle?.font_color || sch.tag?.font_color || "var(--text)",
            fontWeight: "bold",
            fontStyle: sch.tag?.is_italic ? "italic" : "normal",
            ...contentStyleOverrides,
          }}
        >
          {scheduleTooltipText && (
            <div
              className={`pointer-events-none absolute bottom-full z-50 mb-1 hidden w-max max-w-[min(240px,70vw)] whitespace-pre-wrap break-words rounded-lg border border-dunggeure-light/70 bg-[var(--card)] px-2.5 py-1.5 text-left font-hakgyoansimnadeuri text-[11px] font-bold leading-snug text-[var(--text)] opacity-0 shadow-lg transition md:block md:group-hover:opacity-100 ${scheduleTooltipPositionClass}`}
            >
              {scheduleTooltipText}
            </div>
          )}
          {(sch.meta?.venue || hasCollabMembers || showMemoIndicator) && (
            <div className="mb-0.5 flex items-center justify-end gap-0.5 self-stretch md:hidden">
              {sch.meta?.venue && (
                <span
                  aria-label={venueTitle}
                  className="inline-flex h-3 min-w-3 items-center justify-center rounded-full bg-dunggeure-primary px-0.5 text-[7px] font-bold leading-none text-white"
                >
                  {venueLabel}
                </span>
              )}
              {hasCollabMembers && (
                <span
                  aria-label="합방 멤버"
                  className="leading-none text-[10px] text-dunggeure-primary"
                >
                  ❤︎
                </span>
              )}
              {showMemoIndicator && (
                <span
                  aria-label="메모"
                  className="leading-none text-[10px] text-dunggeure-primary"
                >
                  ✦
                </span>
              )}
            </div>
          )}
          {imageOnly ? (
            <LoadingImage
              src={sch.image_url || ""}
              alt={sch.content || "일정 이미지"}
              wrapperClassName="flex h-full w-full items-center justify-center rounded"
              skeletonClassName="rounded"
              className={`w-full rounded object-contain ${
                single ? "max-h-full" : "max-h-14 md:max-h-20"
              }`}
            />
          ) : (
            <div
              onDoubleClick={(event) => {
                if (!canQuickEdit) return;
                event.preventDefault();
                event.stopPropagation();
                startInlineEdit("content");
              }}
              className="line-clamp-4 w-full max-w-full select-none overflow-hidden whitespace-pre-line break-keep px-0.5 md:line-clamp-none"
              style={{
                wordBreak: "keep-all",
                overflowWrap: "break-word",
              }}
            >
              <RichTextContent
                segments={contentRichSegments}
                fallback={sch.content}
              />
            </div>
          )}
          {sch.meta?.venue && (
            <span
              aria-label={venueTitle}
              className={`absolute -top-0.5 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-dunggeure-primary text-[8px] font-bold leading-none text-white md:inline-flex ${
                hasCollabMembers && showMemoIndicator
                  ? "right-6"
                  : hasCollabMembers || showMemoIndicator
                    ? "right-3"
                    : "-right-0.5"
              }`}
            >
              {venueLabel}
            </span>
          )}
          {hasCollabMembers && (
            <span
              aria-label="합방 멤버"
              className="absolute -top-0.5 -right-0.5 hidden leading-none text-[12px] text-dunggeure-primary md:block"
            >
              ❤︎
            </span>
          )}
          {showMemoIndicator && (
            <span
              aria-label="메모"
              className={`absolute -top-0.5 hidden leading-none text-[12px] text-dunggeure-primary md:block ${
                hasCollabMembers ? "right-3" : "-right-0.5"
              }`}
            >
              ✦
            </span>
          )}
        </div>
      </div>
      {editingField &&
        quickEditPopoverPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={quickEditPopoverRef}
            role="dialog"
            aria-label={
              editingField === "time" ? "일정 시간 수정" : "일정 내용 수정"
            }
            style={{
              position: "fixed",
              top: quickEditPopoverPos.top,
              bottom: quickEditPopoverPos.bottom,
              left: quickEditPopoverPos.left,
              width: quickEditPopoverPos.width,
              maxHeight: quickEditPopoverPos.maxHeight,
              transformOrigin:
                quickEditPopoverPos.placement === "above"
                  ? "bottom center"
                  : "top center",
            }}
            className="z-[95] flex min-h-0 flex-col overflow-hidden rounded-2xl border border-dunggeure-light/70 bg-[var(--card)] font-hakgyoansimnadeuri shadow-2xl"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden overscroll-contain p-3">
              <div className="text-xs font-bold text-dunggeure-dark">
                {editingField === "time" ? "시간 수정" : "내용 수정"}
              </div>
              {renderQuickTagControls()}
              {editingField === "time" ? (
                <>
                  <KoreanTimeInput
                    value={draftValue}
                    onChange={setDraftValue}
                    inputAutoFocus
                    onInputKeyDown={handleInlineKeyDown}
                    inputClassName="w-full min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-center text-sm font-bold text-dunggeure-primary outline-none"
                    inputStyle={{
                      backgroundColor: quickTimeStyleEnabled
                        ? combineColor(quickTimeBgColor, quickTimeBgAlpha)
                        : undefined,
                      color: quickTimeStyleEnabled
                        ? combineColor(quickTimeFontColor, quickTimeFontAlpha)
                        : undefined,
                      fontWeight: quickTimeStyleEnabled
                        ? quickTimeFontWeight
                        : "bold",
                      fontStyle:
                        quickTimeStyleEnabled && quickTimeIsItalic
                          ? "italic"
                          : "normal",
                      textDecoration: quickTimeStyleEnabled
                        ? [
                            quickTimeIsUnderline && "underline",
                            quickTimeIsStrikethrough && "line-through",
                          ]
                            .filter(Boolean)
                            .join(" ") || "none"
                        : "none",
                      fontSize: quickTimeStyleEnabled
                        ? `${Math.max(8, Math.min(20, quickTimeFontSize))}px`
                        : undefined,
                      textAlign: quickTimeStyleEnabled
                        ? quickTimeTextAlign
                        : undefined,
                    }}
                    placeholder="예: 7 또는 7:30"
                  />
                  {renderQuickStyleToggle(
                    "시간 스타일 설정",
                    quickTimeStyleOpen,
                    () => setQuickTimeStyleOpen((open) => !open),
                  )}
                  <AnimatePresence initial={false}>
                    {quickTimeStyleOpen && (
                      <motion.div
                        key="quick-time-style"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        {renderQuickTimeStyleControls()}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <>
                  <textarea
                    ref={quickContentTextareaRef}
                    autoFocus
                    value={draftValue}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setQuickContentRichSegments((segments) =>
                        reconcileRichTextSegmentsForText(
                          segments,
                          draftValue,
                          nextValue,
                        ),
                      );
                      setDraftValue(nextValue);
                    }}
                    onFocus={updateQuickContentSelection}
                    onSelect={updateQuickContentSelection}
                    onMouseUp={updateQuickContentSelection}
                    onKeyUp={updateQuickContentSelection}
                    onKeyDown={handleInlineKeyDown}
                    className="min-h-[88px] w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm font-bold text-[var(--text)] outline-none"
                    style={{
                      backgroundColor: quickContentStyleEnabled
                        ? combineColor(quickContentBgColor, quickContentBgAlpha)
                        : undefined,
                      color: quickContentStyleEnabled
                        ? combineColor(
                            quickContentFontColor,
                            quickContentFontAlpha,
                          )
                        : undefined,
                      fontWeight: quickContentStyleEnabled
                        ? quickContentFontWeight
                        : "bold",
                      fontStyle:
                        quickContentStyleEnabled && quickContentIsItalic
                          ? "italic"
                          : "normal",
                      textDecoration: quickContentStyleEnabled
                        ? [
                            quickContentIsUnderline && "underline",
                            quickContentIsStrikethrough && "line-through",
                          ]
                            .filter(Boolean)
                            .join(" ") || "none"
                        : "none",
                      fontSize: quickContentStyleEnabled
                        ? `${Math.max(8, Math.min(28, quickContentFontSize))}px`
                        : undefined,
                      textAlign: quickContentStyleEnabled
                        ? quickContentTextAlign
                        : undefined,
                    }}
                    rows={3}
                    placeholder="일정 내용을 입력하세요"
                  />
                  {renderQuickStyleToggle(
                    quickImageUrl ? "이미지/스티커" : "이미지/스티커 추가",
                    quickImageOpen,
                    () => setQuickImageOpen((open) => !open),
                  )}
                  <AnimatePresence initial={false}>
                    {quickImageOpen && (
                      <motion.div
                        key="quick-image-controls"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        {renderQuickImageControls()}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {renderQuickStyleToggle(
                    "내용 스타일 설정",
                    quickContentStyleOpen,
                    () => setQuickContentStyleOpen((open) => !open),
                  )}
                </>
              )}
              <AnimatePresence initial={false}>
                {editingField === "content" && quickContentStyleOpen && (
                  <motion.div
                    key="quick-content-style"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    {renderQuickContentStyleControls()}
                  </motion.div>
                )}
              </AnimatePresence>
              {(hasTimeNote || hasCollabMembers || hasMemo) && (
                <>
                  {renderQuickStyleToggle(
                    "부가 정보 수정",
                    quickExtraOpen,
                    () => setQuickExtraOpen((open) => !open),
                  )}
                  <AnimatePresence initial={false}>
                    {quickExtraOpen && (
                      <motion.div
                        key="quick-extra-info"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        {renderQuickExtraInfoControls()}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
              {renderInlineEditActions()}
            </div>
          </div>,
          document.body,
        )}
      {contextMenu &&
        createPortal(
          <div
            className="fixed z-[90] min-w-28 overflow-hidden rounded-xl border border-dunggeure-light/70 bg-[var(--card)] py-1 font-hakgyoansimnadeuri text-sm font-bold shadow-xl"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 128),
              top: Math.min(contextMenu.y, window.innerHeight - 132),
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => startInlineEdit("time")}
              className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-dunggeure-lighter/35"
            >
              <Edit2 size={14} />
              시간 수정
            </button>
            <button
              type="button"
              onClick={() => startInlineEdit("content")}
              className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-dunggeure-lighter/35"
            >
              <Edit2 size={14} />
              내용 수정
            </button>
            <button
              type="button"
              onClick={() => {
                setContextMenu(null);
                setShowDeleteDialog(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-500 transition hover:bg-red-50"
            >
              <Trash2 size={14} />
              삭제
            </button>
          </div>,
          document.body,
        )}
      <AppDialog
        open={showDeleteDialog}
        title="일정 삭제"
        description="이 일정을 삭제할까요? 삭제한 내용은 되돌릴 수 없습니다."
        confirmText="삭제"
        cancelText="취소"
        variant="danger"
        busy={busy}
        onConfirm={deleteSchedule}
        onClose={() => {
          if (!busy) setShowDeleteDialog(false);
        }}
      />
      {quickShowStickerPicker && (
        <StickerPicker
          isAdmin={isAdmin}
          onPick={(url) => {
            setQuickImageUrl(url);
            setQuickImageOpen(true);
            setQuickShowStickerPicker(false);
          }}
          onClose={() => setQuickShowStickerPicker(false)}
        />
      )}
    </>
  );
}

// ===== 일정 검색 팝업 =====
function SearchPopup({
  tags,
  isAdmin,
  refreshToken,
  onClose,
  onViewSchedule,
  onEditSchedule,
}: {
  tags: ScheduleTag[];
  isAdmin: boolean;
  refreshToken: number;
  onClose: () => void;
  onViewSchedule: (schedule: Schedule) => void;
  onEditSchedule: (schedule: Schedule) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [results, setResults] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [error, setError] = useState("");
  const searchRequestSeq = useRef(0);
  const loadingMoreRef = useRef(false);
  const lastRefreshToken = useRef(refreshToken);

  const hasSearchCriteria =
    Boolean(query.trim()) ||
    selectedTags.length > 0 ||
    Boolean(startDate) ||
    Boolean(endDate);

  const loadSearchPage = useCallback(
    async (offset: number, append: boolean) => {
      if (!hasSearchCriteria) {
        setResults([]);
        setHasMore(false);
        setNextOffset(0);
        setLoading(false);
        setLoadingMore(false);
        setError("");
        return;
      }
      if (append && loadingMoreRef.current) return;

      const cacheKey = getScheduleSearchCacheKey({
        query,
        selectedTags,
        startDate,
        endDate,
        sortOrder,
        offset,
      });
      const cachedEntry = scheduleSearchCache.get(cacheKey);
      if (cachedEntry) {
        if (append) {
          setResults((prev) => {
            const seen = new Set(prev.map((schedule) => schedule.id));
            return [
              ...prev,
              ...cachedEntry.schedules.filter(
                (schedule) => !seen.has(schedule.id),
              ),
            ];
          });
        } else {
          setResults(cachedEntry.schedules);
        }
        setNextOffset(cachedEntry.nextOffset);
        setHasMore(cachedEntry.hasMore);
        setLoading(false);
        setLoadingMore(false);
        setError("");
        return;
      }

      const requestSeq = searchRequestSeq.current + 1;
      searchRequestSeq.current = requestSeq;

      if (append) {
        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else {
        setLoading(true);
        setResults([]);
      }
      setError("");

      try {
        const params = new URLSearchParams({
          limit: String(SEARCH_PAGE_LIMIT),
          offset: String(offset),
          order: sortOrder,
        });
        const trimmedQuery = query.trim();
        if (trimmedQuery) params.set("q", trimmedQuery);
        if (selectedTags.length > 0) {
          params.set("tagIds", [...selectedTags].sort().join(","));
        }
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);

        const response = await fetch(
          `/api/schedule/search?${params.toString()}`,
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to search schedules");
        }
        if (searchRequestSeq.current !== requestSeq) return;

        const nextSchedules = data.schedules || [];
        const nextEntry = {
          schedules: nextSchedules,
          nextOffset:
            typeof data.nextOffset === "number"
              ? data.nextOffset
              : offset + nextSchedules.length,
          hasMore: Boolean(data.hasMore),
        };
        setScheduleSearchCache(cacheKey, nextEntry);
        setResults((prev) =>
          append
            ? [
                ...prev,
                ...nextSchedules.filter(
                  (schedule: Schedule) =>
                    !prev.some((item) => item.id === schedule.id),
                ),
              ]
            : nextSchedules,
        );
        setNextOffset(nextEntry.nextOffset);
        setHasMore(nextEntry.hasMore);
      } catch {
        if (searchRequestSeq.current === requestSeq) {
          if (!append) setResults([]);
          setError("일정 검색 데이터를 불러오지 못했습니다.");
        }
      } finally {
        if (searchRequestSeq.current === requestSeq) {
          setLoading(false);
          setLoadingMore(false);
        }
        if (append) loadingMoreRef.current = false;
      }
    },
    [endDate, hasSearchCriteria, query, selectedTags, sortOrder, startDate],
  );

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadSearchPage(0, false);
    }, 250);

    return () => window.clearTimeout(timerId);
  }, [loadSearchPage]);

  useEffect(() => {
    if (lastRefreshToken.current === refreshToken) return;
    lastRefreshToken.current = refreshToken;
    if (!hasSearchCriteria) return;
    loadSearchPage(0, false);
  }, [hasSearchCriteria, loadSearchPage, refreshToken]);

  useEffect(() => {
    return lockBodyScroll();
  }, []);

  const handleSearchResultsScroll = (event: ReactUIEvent<HTMLDivElement>) => {
    if (!hasMore || loading || loadingMore) return;
    const target = event.currentTarget;
    const scrollableHeight = target.scrollHeight - target.clientHeight;
    if (scrollableHeight <= 0) return;
    const progress = target.scrollTop / scrollableHeight;
    if (progress >= 0.65) {
      loadSearchPage(nextOffset, true);
    }
  };

  const searchResultViewKey = loading
    ? "loading"
    : error
      ? "error"
      : !hasSearchCriteria
        ? "empty-criteria"
        : results.length === 0
          ? "empty-results"
          : "results";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh] backdrop-blur-sm sm:pt-[14vh]"
      onClick={onClose}
    >
      <div
        className="flex h-[80vh] max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[var(--card)] font-hakgyoansimnadeuri shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
          <h3 className="font-bold text-dunggeure-dark">일정 검색</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-dunggeure-lighter/30 rounded-lg transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 border-b border-[var(--border)]">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="내용, 합방멤버 등으로 검색..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm outline-none focus:border-dunggeure-primary transition"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <button
              type="button"
              onClick={() =>
                setSelectedTags((prev) =>
                  prev.includes(NO_TAG_FILTER_ID)
                    ? prev.filter((tagId) => tagId !== NO_TAG_FILTER_ID)
                    : [...prev, NO_TAG_FILTER_ID],
                )
              }
              className={`px-2.5 py-1 rounded-full border text-xs font-medium transition ${
                selectedTags.includes(NO_TAG_FILTER_ID)
                  ? "border-dunggeure-primary bg-dunggeure-primary/10 text-dunggeure-primary ring-2 ring-dunggeure-primary"
                  : "border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] opacity-80 hover:opacity-100"
              }`}
            >
              태그 없음
            </button>
            {tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() =>
                  setSelectedTags((prev) =>
                    prev.includes(tag.id)
                      ? prev.filter((t) => t !== tag.id)
                      : [...prev, tag.id],
                  )
                }
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                  selectedTags.includes(tag.id)
                    ? "ring-2 ring-dunggeure-primary"
                    : "opacity-70 hover:opacity-100"
                }`}
                style={buildScheduleTagStyle(tag)}
              >
                {tag.name}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              정렬
            </span>
            <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg)] p-0.5">
              {(["desc", "asc"] as const).map((order) => (
                <button
                  key={order}
                  type="button"
                  onClick={() => setSortOrder(order)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    sortOrder === order
                      ? "bg-dunggeure-primary text-white shadow-sm"
                      : "text-[var(--text-secondary)] hover:bg-dunggeure-lighter/30 hover:text-dunggeure-primary"
                  }`}
                >
                  {order === "desc" ? "최신순" : "오래된순"}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)_1.75rem_minmax(0,1fr)] items-end gap-2">
            <SearchDatePicker
              label="시작일"
              value={startDate}
              onChange={setStartDate}
              align="left"
            />
            <span className="mb-0.5 flex h-9 items-center justify-center rounded-lg text-sm font-bold leading-none text-dunggeure-primary">
              ~
            </span>
            <SearchDatePicker
              label="종료일"
              value={endDate}
              onChange={setEndDate}
              align="right"
            />
          </div>
        </div>

        <div
          className="flex-1 overscroll-contain overflow-y-auto p-4"
          onScroll={handleSearchResultsScroll}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={searchResultViewKey}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {loading ? (
                <SearchResultSkeleton />
              ) : error ? (
                <p className="py-8 text-center text-sm text-red-600">{error}</p>
              ) : !hasSearchCriteria ? (
                <p className="py-8 text-center text-sm text-[var(--text-secondary)]">
                  검색어, 태그 또는 날짜 범위를 선택해주세요.
                </p>
              ) : results.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--text-secondary)]">
                  일치하는 검색 결과가 없습니다.
                </p>
              ) : (
                <div className="space-y-2">
                  {results.map((sch) => (
                    <div
                      key={sch.id}
                      className="rounded-lg border border-[var(--border)] p-3 text-sm"
                      style={{
                        ...buildScheduleTagBorderStyle(sch.tag),
                        backgroundColor: getScheduleTagTint(sch.tag, 0.12),
                      }}
                    >
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-[var(--text-secondary)]">
                            {sch.date}
                          </span>
                          {getScheduleDisplayTime(sch) && (
                            <span className="whitespace-pre-line text-xs font-bold text-dunggeure-primary">
                              {getScheduleDisplayTime(sch)}
                            </span>
                          )}
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                              sch.tag
                                ? ""
                                : "border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                            }`}
                            style={
                              sch.tag
                                ? buildScheduleTagStyle(sch.tag)
                                : undefined
                            }
                          >
                            {sch.tag?.name || "태그 없음"}
                          </span>
                          {sch.meta?.venue && (
                            <span className="rounded-full bg-dunggeure-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {sch.meta.venue === "home" ? "홈" : "원정"}
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => onViewSchedule(sch)}
                            className="rounded p-1 text-dunggeure-primary transition hover:bg-dunggeure-primary/15 hover:ring-1 hover:ring-dunggeure-primary/35"
                            aria-label="달력에서 보기"
                            title="달력에서 보기"
                          >
                            <LocateFixed size={14} />
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => onEditSchedule(sch)}
                              className="shrink-0 rounded p-1 text-dunggeure-primary transition hover:bg-dunggeure-lighter/30"
                              aria-label="검색 결과 일정 수정"
                              title="일정 수정"
                            >
                              <Edit2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                      <p>
                        <RichTextContent
                          segments={getScheduleContentRichSegments(sch)}
                          fallback={sch.content || "(내용 없음)"}
                        />
                      </p>
                      {sch.collab_members?.length > 0 && (
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          w. {sch.collab_members.join(", ")}
                        </p>
                      )}
                      {sch.memo?.trim() && (
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs text-[var(--text-secondary)]">
                          ✦ {sch.memo.trim()}
                        </p>
                      )}
                    </div>
                  ))}
                  {loadingMore && <SearchResultSkeleton compact />}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function SearchResultSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: compact ? 3 : 7 }).map((_, idx) => (
        <div key={idx} className="rounded-lg border border-[var(--border)] p-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-3 w-20 animate-pulse rounded bg-dunggeure-lighter/80" />
            <div className="h-3 w-10 animate-pulse rounded bg-dunggeure-lighter/70" />
            <div className="h-4 w-12 animate-pulse rounded-full bg-dunggeure-lighter/70" />
          </div>
          <div className="h-4 w-3/4 animate-pulse rounded bg-dunggeure-lighter/80" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-dunggeure-lighter/60" />
        </div>
      ))}
    </div>
  );
}

function SearchDatePicker({
  label,
  value,
  onChange,
  align,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  align: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => dateValueToDate(value));
  const [openMonthPart, setOpenMonthPart] = useState<"year" | "month" | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverPos, setPopoverPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    if (open || !value) return;
    setViewMonth(dateValueToDate(value));
  }, [open, value]);

  useEffect(() => {
    if (!open) setOpenMonthPart(null);
  }, [open]);

  // 트리거 버튼 위치 기준으로 popover 좌표 계산 (스크롤/리사이즈 시 재계산)
  useEffect(() => {
    if (!open) return;
    const POP_WIDTH = Math.min(272, window.innerWidth - 24); // 17rem ≈ 272px
    const updatePos = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 12;
      let left = align === "right" ? rect.right - POP_WIDTH : rect.left;
      // 화면 좌우 경계 보정
      left = Math.max(
        margin,
        Math.min(left, window.innerWidth - POP_WIDTH - margin),
      );
      setPopoverPos({ top: rect.bottom + 8, left });
    };
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open, align]);

  // 외부 클릭 감지 (트리거/popover 어느쪽도 아니면 닫기)
  useEffect(() => {
    if (!open) return;
    const handleOutsidePointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleOutsidePointer);
    document.addEventListener("touchstart", handleOutsidePointer);
    return () => {
      document.removeEventListener("mousedown", handleOutsidePointer);
      document.removeEventListener("touchstart", handleOutsidePointer);
    };
  }, [open]);

  const monthStart = startOfMonth(viewMonth);
  const today = getKoreaToday();
  const yearOptions = useMemo(() => {
    const viewYear = viewMonth.getFullYear();
    const minYear = Math.min(2025, today.getFullYear() - 2, viewYear - 2);
    const maxYear = Math.max(today.getFullYear() + 1, viewYear + 2);
    return Array.from(
      { length: maxYear - minYear + 1 },
      (_, index) => minYear + index,
    );
  }, [today, viewMonth]);
  const calendarDays = eachDayOfInterval({
    start: startOfWeek(monthStart),
    end: endOfWeek(endOfMonth(viewMonth)),
  });
  const selectedDate = value ? dateValueToDate(value) : null;
  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => index),
    [],
  );

  return (
    <div className="min-w-0">
      <span className="mb-1 block text-[11px] text-[var(--text-secondary)] sm:text-xs">
        {label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((next) => !next)}
        className={`flex h-9 w-full min-w-0 items-center justify-between gap-1 rounded-lg border px-2 text-left text-[13px] leading-none transition ${
          value
            ? "border-dunggeure-light bg-dunggeure-lighter/20 text-dunggeure-dark"
            : "border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)]"
        } hover:border-dunggeure-light hover:bg-dunggeure-lighter/30`}
      >
        <span className="min-w-0 truncate">{formatSearchDateValue(value)}</span>
        <CalendarDays size={13} className="shrink-0" />
      </button>

      {open &&
        popoverPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              top: popoverPos.top,
              left: popoverPos.left,
              width: "min(17rem, calc(100vw - 1.5rem))",
            }}
            className="z-[100] rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-2xl font-hakgyoansimnadeuri"
          >
            <div className="mb-2 flex items-center justify-between gap-1.5">
              <button
                type="button"
                onClick={() => setViewMonth((month) => subMonths(month, 1))}
                className="rounded-lg p-1.5 text-dunggeure-primary transition hover:bg-dunggeure-lighter/30"
                aria-label="이전 달"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-1">
                <div className="relative min-w-0">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenMonthPart((part) =>
                        part === "year" ? null : "year",
                      )
                    }
                    aria-expanded={openMonthPart === "year"}
                    aria-label="년도 선택"
                    className="flex h-8 w-full min-w-0 items-center justify-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-xs font-bold text-dunggeure-dark outline-none transition hover:border-dunggeure-light focus:border-dunggeure-primary"
                  >
                    <span className="truncate">
                      {viewMonth.getFullYear()}년
                    </span>
                    <ChevronDown
                      size={12}
                      className={`shrink-0 transition-transform ${
                        openMonthPart === "year" ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {openMonthPart === "year" && (
                    <div className="absolute left-0 top-[calc(100%+0.25rem)] z-10 max-h-40 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 shadow-xl">
                      {yearOptions.map((year) => {
                        const selected = viewMonth.getFullYear() === year;
                        return (
                          <button
                            key={year}
                            type="button"
                            onClick={() => {
                              setViewMonth(
                                (month) => new Date(year, month.getMonth(), 1),
                              );
                              setOpenMonthPart(null);
                            }}
                            className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-bold transition ${
                              selected
                                ? "bg-dunggeure-primary text-white"
                                : "text-[var(--text)] hover:bg-dunggeure-lighter/30 hover:text-dunggeure-primary"
                            }`}
                          >
                            <span>{year}년</span>
                            {selected && <Check size={12} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="relative min-w-0">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenMonthPart((part) =>
                        part === "month" ? null : "month",
                      )
                    }
                    aria-expanded={openMonthPart === "month"}
                    aria-label="월 선택"
                    className="flex h-8 w-full min-w-0 items-center justify-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-xs font-bold text-dunggeure-dark outline-none transition hover:border-dunggeure-light focus:border-dunggeure-primary"
                  >
                    <span className="truncate">
                      {viewMonth.getMonth() + 1}월
                    </span>
                    <ChevronDown
                      size={12}
                      className={`shrink-0 transition-transform ${
                        openMonthPart === "month" ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {openMonthPart === "month" && (
                    <div className="absolute right-0 top-[calc(100%+0.25rem)] z-10 max-h-40 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 shadow-xl">
                      {monthOptions.map((monthIndex) => {
                        const selected = viewMonth.getMonth() === monthIndex;
                        return (
                          <button
                            key={monthIndex}
                            type="button"
                            onClick={() => {
                              setViewMonth(
                                (month) =>
                                  new Date(month.getFullYear(), monthIndex, 1),
                              );
                              setOpenMonthPart(null);
                            }}
                            className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-bold transition ${
                              selected
                                ? "bg-dunggeure-primary text-white"
                                : "text-[var(--text)] hover:bg-dunggeure-lighter/30 hover:text-dunggeure-primary"
                            }`}
                          >
                            <span>{monthIndex + 1}월</span>
                            {selected && <Check size={12} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewMonth((month) => addMonths(month, 1))}
                className="rounded-lg p-1.5 text-dunggeure-primary transition hover:bg-dunggeure-lighter/30"
                aria-label="다음 달"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-bold">
              {DAY_HEADERS.map((day, index) => (
                <span key={day} style={{ color: DAY_HEADER_COLORS[index] }}>
                  {day}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day) => {
                const inMonth = isSameMonth(day, viewMonth);
                const selected = selectedDate && isSameDay(day, selectedDate);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => {
                      onChange(dateToInputValue(day));
                      setViewMonth(day);
                      setOpen(false);
                    }}
                    className={`flex aspect-square items-center justify-center rounded-lg text-xs font-bold transition ${
                      selected
                        ? "bg-dunggeure-primary text-white shadow"
                        : isSameDay(day, getKoreaToday())
                          ? "bg-dunggeure-lighter text-dunggeure-primary"
                          : "hover:bg-dunggeure-lighter/30"
                    } ${inMonth ? "text-[var(--text)]" : "text-[var(--text-secondary)] opacity-35"}`}
                  >
                    {format(day, "d")}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="rounded-lg px-2 py-1 text-xs text-[var(--text-secondary)] transition hover:bg-dunggeure-lighter/30 hover:text-dunggeure-primary"
              >
                초기화
              </button>
              <button
                type="button"
                onClick={() => {
                  const today = getKoreaToday();
                  onChange(dateToInputValue(today));
                  setViewMonth(today);
                  setOpen(false);
                }}
                className="rounded-lg bg-dunggeure-primary px-2 py-1 text-xs text-white transition hover:bg-dunggeure-dark"
              >
                오늘
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

// ===== 일정 상세/추가 팝업 =====
function DayPopup({
  day,
  schedules,
  tags,
  isAdmin,
  initialEditScheduleId,
  initialHighlightScheduleId,
  onInitialEditHandled,
  onDayChange,
  onClose,
  onLocalScheduleMutation,
  onScheduleSaved,
  onScheduleDeleted,
  onSchedulesReordered,
  onTagsChanged,
}: {
  day: Date;
  schedules: Schedule[];
  tags: ScheduleTag[];
  isAdmin: boolean;
  initialEditScheduleId?: string | null;
  initialHighlightScheduleId?: string | null;
  onInitialEditHandled?: () => void;
  onDayChange: (day: Date) => void;
  onClose: () => void;
  onLocalScheduleMutation: () => void;
  onScheduleSaved: (schedule: Schedule, affectedSchedules?: Schedule[]) => void;
  onScheduleDeleted: (id: string) => void;
  onSchedulesReordered: (schedules: Schedule[]) => void;
  onTagsChanged: () => void;
}) {
  const initialScheduleDefaultTag = getScheduleDefaultTag(tags);
  const [mode, setMode] = useState<"view" | "edit" | "offset">(
    isAdmin && initialEditScheduleId
      ? "edit"
      : isAdmin && schedules.length === 0 && !initialHighlightScheduleId
        ? "edit"
        : "view",
  );
  const [highlightedScheduleId, setHighlightedScheduleId] = useState<
    string | null
  >(initialHighlightScheduleId ?? null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedTagId, setSelectedTagId] = useState(
    () => initialScheduleDefaultTag?.id || "",
  );
  const [time, setTime] = useState(
    initialScheduleDefaultTag?.default_time || "",
  );
  const [timeNote, setTimeNote] = useState("");
  const [content, setContent] = useState(
    initialScheduleDefaultTag?.default_content || "",
  );
  const [contentRichSegments, setContentRichSegments] = useState<
    ScheduleRichTextSegment[]
  >([]);
  const [memo, setMemo] = useState("");
  const [editingMeta, setEditingMeta] = useState<Schedule["meta"]>({});
  const [contentStyleScope, setContentStyleScope] = useState<
    "selection" | "all"
  >("selection");
  const [contentStyleEnabled, setContentStyleEnabled] = useState(false);
  const [contentFontWeight, setContentFontWeight] = useState<"normal" | "bold">(
    "normal",
  );
  const [contentIsItalic, setContentIsItalic] = useState(false);
  const [contentIsUnderline, setContentIsUnderline] = useState(false);
  const [contentIsStrikethrough, setContentIsStrikethrough] = useState(false);
  const [contentFontSize, setContentFontSize] = useState(14);
  const [contentFontSizePicker, setContentFontSizePicker] = useState(14);
  const [contentTextAlign, setContentTextAlign] = useState<
    "left" | "center" | "right"
  >("center");
  const [contentBgColor, setContentBgColor] = useState("#ffffff");
  const [contentBgAlpha, setContentBgAlpha] = useState(1);
  const [contentBgPickerColor, setContentBgPickerColor] = useState("#ffffff");
  const [contentBgPickerAlpha, setContentBgPickerAlpha] = useState(1);
  const [contentFontColor, setContentFontColor] = useState("#333333");
  const [contentFontAlpha, setContentFontAlpha] = useState(1);
  const [contentFontPickerColor, setContentFontPickerColor] =
    useState("#333333");
  const [contentFontPickerAlpha, setContentFontPickerAlpha] = useState(1);
  const [timeStyleEnabled, setTimeStyleEnabled] = useState(false);
  const [timeFontWeight, setTimeFontWeight] = useState<"normal" | "bold">(
    "normal",
  );
  const [timeIsItalic, setTimeIsItalic] = useState(false);
  const [timeIsUnderline, setTimeIsUnderline] = useState(false);
  const [timeIsStrikethrough, setTimeIsStrikethrough] = useState(false);
  const [timeFontSize, setTimeFontSize] = useState(14);
  const [timeTextAlign, setTimeTextAlign] = useState<
    "left" | "center" | "right"
  >("center");
  const [timeBgColor, setTimeBgColor] = useState("#ffffff");
  const [timeBgAlpha, setTimeBgAlpha] = useState(0);
  const [timeFontColor, setTimeFontColor] = useState("#612DD4");
  const [timeFontAlpha, setTimeFontAlpha] = useState(1);
  const [collabMembers, setCollabMembers] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [venue, setVenue] = useState<"" | "home" | "away">("");
  const [uploading, setUploading] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [popupSchedules, setPopupSchedules] = useState(schedules);
  const [popupDraggingId, setPopupDraggingId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [daySlideDirection, setDaySlideDirection] = useState<-1 | 1>(1);
  const dayPopupBackdropPointerDownRef = useRef(false);
  const highlightedScheduleRefs = useRef<Map<string, HTMLDivElement>>(
    new Map(),
  );
  const dayPopupSwipeRef = useRef({
    startX: 0,
    startY: 0,
    active: false,
  });
  const timeInputRef = useRef<HTMLInputElement | null>(null);
  const timeStylePopoverRef = useRef<HTMLDivElement | null>(null);
  const [showTimeStylePopover, setShowTimeStylePopover] = useState(false);
  const [timeStylePopoverPos, setTimeStylePopoverPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const timeNoteInputRef = useRef<HTMLInputElement | null>(null);
  const timeNotePopoverRef = useRef<HTMLDivElement | null>(null);
  const [showTimeNotePopover, setShowTimeNotePopover] = useState(false);
  const [timeNotePopoverPos, setTimeNotePopoverPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [contentSelectionRange, setContentSelectionRange] =
    useState<TextSelectionRange | null>(null);
  const contentStylePopoverRef = useRef<HTMLDivElement | null>(null);
  const [showContentStylePopover, setShowContentStylePopover] = useState(false);
  const [contentStylePopoverPos, setContentStylePopoverPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const dateStr = format(day, "yyyy-MM-dd");
  const previousDateStrRef = useRef(dateStr);
  const holidayName = getHolidayName(day);
  const holidayBadgeLabel =
    holidayName && isCustomHoliday(day)
      ? holidayName
      : holidayName
        ? `공휴일 · ${holidayName}`
        : null;
  const goToPreviousDay = () => {
    setDaySlideDirection(-1);
    onDayChange(subDays(day, 1));
  };
  const goToNextDay = () => {
    setDaySlideDirection(1);
    onDayChange(addDays(day, 1));
  };
  const handleDayPopupTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (mode !== "view" || event.touches.length !== 1) return;
    const touch = event.touches[0];
    dayPopupSwipeRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      active: true,
    };
  };
  const handleDayPopupTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    const swipe = dayPopupSwipeRef.current;
    if (!swipe.active || mode !== "view") return;

    dayPopupSwipeRef.current.active = false;
    const touch = event.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - swipe.startX;
    const deltaY = touch.clientY - swipe.startY;
    if (Math.abs(deltaX) < 70 || Math.abs(deltaX) < Math.abs(deltaY) * 1.4) {
      return;
    }

    if (deltaX < 0) {
      goToNextDay();
    } else {
      goToPreviousDay();
    }
  };
  const handleDayPopupTouchCancel = () => {
    dayPopupSwipeRef.current.active = false;
  };
  const popupSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
  );

  useEffect(() => {
    setPopupSchedules(sortSchedulesForDisplay(schedules));
  }, [schedules]);

  useEffect(() => {
    if (!initialHighlightScheduleId) return;
    setHighlightedScheduleId(initialHighlightScheduleId);
    setMode("view");
  }, [initialHighlightScheduleId]);

  useEffect(() => {
    if (previousDateStrRef.current === dateStr) return;
    previousDateStrRef.current = dateStr;
    setHighlightedScheduleId(null);
  }, [dateStr]);

  useEffect(() => {
    if (!highlightedScheduleId || mode !== "view") return;
    if (
      !popupSchedules.some((schedule) => schedule.id === highlightedScheduleId)
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      highlightedScheduleRefs.current
        .get(highlightedScheduleId)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [highlightedScheduleId, mode, popupSchedules]);

  useEffect(() => {
    if (!highlightedScheduleId) return;
    const timerId = window.setTimeout(() => {
      setHighlightedScheduleId((current) =>
        current === highlightedScheduleId ? null : current,
      );
    }, 4000);

    return () => window.clearTimeout(timerId);
  }, [highlightedScheduleId]);

  useEffect(() => {
    return lockBodyScroll();
  }, []);

  const selectedTag = tags.find((t) => t.id === selectedTagId);
  const showVenue = false;
  const contentStyleBaseColors = getBaseScheduleContentColors(selectedTag);
  const visibleContentBgColor = {
    hex: contentBgPickerColor,
    alpha: contentBgPickerAlpha,
  };
  const visibleContentFontColor = {
    hex: contentFontPickerColor,
    alpha: contentFontPickerAlpha,
  };
  const visibleTimeBgColor = timeStyleEnabled
    ? { hex: timeBgColor, alpha: timeBgAlpha }
    : { hex: "#ffffff", alpha: 0 };
  const visibleTimeFontColor = timeStyleEnabled
    ? { hex: timeFontColor, alpha: timeFontAlpha }
    : { hex: "#612DD4", alpha: 1 };
  const popupActiveSchedule = popupDraggingId
    ? popupSchedules.find((schedule) => schedule.id === popupDraggingId) || null
    : null;

  const resetContentStyleState = (tag?: ScheduleTag) => {
    const baseColors = getBaseScheduleContentColors(tag);
    setContentStyleEnabled(false);
    setContentFontWeight("normal");
    setContentIsItalic(false);
    setContentIsUnderline(false);
    setContentIsStrikethrough(false);
    setContentFontSize(14);
    setContentFontSizePicker(14);
    setContentTextAlign("center");
    setContentBgColor(baseColors.bg.hex);
    setContentBgAlpha(baseColors.bg.alpha);
    setContentBgPickerColor(baseColors.bg.hex);
    setContentBgPickerAlpha(baseColors.bg.alpha);
    setContentFontColor(baseColors.fg.hex);
    setContentFontAlpha(baseColors.fg.alpha);
    setContentFontPickerColor(baseColors.fg.hex);
    setContentFontPickerAlpha(baseColors.fg.alpha);
  };

  const enableContentStyle = () => {
    if (contentStyleEnabled) return;
    const baseColors = getBaseScheduleContentColors(selectedTag);
    setContentBgColor(baseColors.bg.hex);
    setContentBgAlpha(baseColors.bg.alpha);
    setContentBgPickerColor(baseColors.bg.hex);
    setContentBgPickerAlpha(baseColors.bg.alpha);
    setContentFontColor(baseColors.fg.hex);
    setContentFontAlpha(baseColors.fg.alpha);
    setContentFontPickerColor(baseColors.fg.hex);
    setContentFontPickerAlpha(baseColors.fg.alpha);
    setContentStyleEnabled(true);
  };

  const resetTimeStyleState = () => {
    setTimeStyleEnabled(false);
    setTimeFontWeight("normal");
    setTimeIsItalic(false);
    setTimeIsUnderline(false);
    setTimeIsStrikethrough(false);
    setTimeFontSize(14);
    setTimeTextAlign("center");
    setTimeBgColor("#ffffff");
    setTimeBgAlpha(0);
    setTimeFontColor("#612DD4");
    setTimeFontAlpha(1);
  };

  const enableTimeStyle = () => {
    if (timeStyleEnabled) return;
    setTimeBgColor("#ffffff");
    setTimeBgAlpha(0);
    setTimeFontColor("#612DD4");
    setTimeFontAlpha(1);
    setTimeStyleEnabled(true);
  };

  const loadTimeStyleState = (meta: Schedule["meta"] | null | undefined) => {
    const style = getScheduleTimeStyle(meta);
    if (!style) {
      resetTimeStyleState();
      return;
    }
    const bg = parseColor(style.bg_color || "#ffffff00");
    const fg = parseColor(style.font_color || "#612DD4");
    setTimeStyleEnabled(true);
    setTimeFontWeight(style.font_weight || "normal");
    setTimeIsItalic(Boolean(style.is_italic));
    setTimeIsUnderline(Boolean(style.is_underline));
    setTimeIsStrikethrough(Boolean(style.is_strikethrough));
    setTimeFontSize(
      typeof style.font_size === "number" && Number.isFinite(style.font_size)
        ? Math.max(8, Math.min(20, style.font_size))
        : 14,
    );
    setTimeTextAlign(
      style.text_align === "left" ||
        style.text_align === "right" ||
        style.text_align === "center"
        ? style.text_align
        : "center",
    );
    setTimeBgColor(bg.hex);
    setTimeBgAlpha(bg.alpha);
    setTimeFontColor(fg.hex);
    setTimeFontAlpha(fg.alpha);
  };

  const updateTimeStylePopoverPosition = useCallback(() => {
    const input = timeInputRef.current;
    if (!input || typeof window === "undefined") return;
    const rect = input.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(420, window.innerWidth - margin * 2);
    const estimatedHeight = 360;
    const left = Math.max(
      margin,
      Math.min(rect.left, window.innerWidth - width - margin),
    );
    const hasBottomSpace =
      window.innerHeight - rect.bottom - margin >= estimatedHeight;
    const top = hasBottomSpace
      ? rect.bottom + 8
      : Math.max(margin, rect.top - estimatedHeight - 8);
    setTimeStylePopoverPos({ top, left, width });
  }, []);

  useEffect(() => {
    if (!showTimeStylePopover) return;
    updateTimeStylePopoverPosition();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (timeInputRef.current?.contains(target)) return;
      if (timeStylePopoverRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".color-field-pop")) {
        return;
      }
      setShowTimeStylePopover(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowTimeStylePopover(false);
    };

    window.addEventListener("resize", updateTimeStylePopoverPosition);
    window.addEventListener("scroll", updateTimeStylePopoverPosition, true);
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", updateTimeStylePopoverPosition);
      window.removeEventListener(
        "scroll",
        updateTimeStylePopoverPosition,
        true,
      );
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showTimeStylePopover, updateTimeStylePopoverPosition]);

  const updateTimeNotePopoverPosition = useCallback(() => {
    const input = timeNoteInputRef.current;
    if (!input || typeof window === "undefined") return;
    const rect = input.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(320, window.innerWidth - margin * 2);
    const estimatedHeight = 132;
    const left = Math.max(
      margin,
      Math.min(rect.left, window.innerWidth - width - margin),
    );
    const hasBottomSpace =
      window.innerHeight - rect.bottom - margin >= estimatedHeight;
    const top = hasBottomSpace
      ? rect.bottom + 8
      : Math.max(margin, rect.top - estimatedHeight - 8);
    setTimeNotePopoverPos({ top, left, width });
  }, []);

  useEffect(() => {
    if (!showTimeNotePopover) return;
    updateTimeNotePopoverPosition();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (timeNoteInputRef.current?.contains(target)) return;
      if (timeNotePopoverRef.current?.contains(target)) return;
      setShowTimeNotePopover(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowTimeNotePopover(false);
    };

    window.addEventListener("resize", updateTimeNotePopoverPosition);
    window.addEventListener("scroll", updateTimeNotePopoverPosition, true);
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", updateTimeNotePopoverPosition);
      window.removeEventListener("scroll", updateTimeNotePopoverPosition, true);
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showTimeNotePopover, updateTimeNotePopoverPosition]);

  const updateContentStylePopoverPosition = useCallback(() => {
    const textarea = contentTextareaRef.current;
    if (!textarea || typeof window === "undefined") return;
    const rect = textarea.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(420, window.innerWidth - margin * 2);
    const estimatedHeight = 300;
    const left = Math.max(
      margin,
      Math.min(rect.left, window.innerWidth - width - margin),
    );
    const hasBottomSpace =
      window.innerHeight - rect.bottom - margin >= estimatedHeight;
    const top = hasBottomSpace
      ? rect.bottom + 8
      : Math.max(margin, rect.top - estimatedHeight - 8);
    setContentStylePopoverPos({ top, left, width });
  }, []);

  useEffect(() => {
    if (!showContentStylePopover) return;
    updateContentStylePopoverPosition();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (contentTextareaRef.current?.contains(target)) return;
      if (contentStylePopoverRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".color-field-pop")) {
        return;
      }
      setShowContentStylePopover(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowContentStylePopover(false);
    };

    window.addEventListener("resize", updateContentStylePopoverPosition);
    window.addEventListener("scroll", updateContentStylePopoverPosition, true);
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", updateContentStylePopoverPosition);
      window.removeEventListener(
        "scroll",
        updateContentStylePopoverPosition,
        true,
      );
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showContentStylePopover, updateContentStylePopoverPosition]);

  useEffect(() => {
    if (mode !== "edit") setShowContentStylePopover(false);
    if (mode !== "edit") setShowTimeNotePopover(false);
    if (mode !== "edit") setShowTimeStylePopover(false);
  }, [mode]);

  const resetForm = () => {
    const defaultTag = getScheduleDefaultTag(tags);
    setEditingId(null);
    setSelectedTagId(defaultTag?.id || "");
    setTime(defaultTag?.default_time || "");
    setTimeNote("");
    setContent(defaultTag?.default_content || "");
    setContentRichSegments([]);
    setContentSelectionRange(null);
    setMemo("");
    setEditingMeta({});
    resetContentStyleState(defaultTag || undefined);
    resetTimeStyleState();
    setCollabMembers("");
    setImageUrl(null);
    setVenue("");
    setError("");
  };

  const startEdit = (sch: Schedule) => {
    setEditingId(sch.id);
    setSelectedTagId(sch.tag_id || "");
    setTime(sch.time || "");
    setTimeNote(sch.meta?.time_note || "");
    setContent(sch.content || "");
    setContentRichSegments(getScheduleContentRichSegments(sch));
    setContentSelectionRange(null);
    setMemo(sch.memo || "");
    setEditingMeta(sch.meta || {});
    loadTimeStyleState(sch.meta);
    const contentStyle = getScheduleContentStyle(sch.meta);
    if (contentStyle) {
      const baseColors = getBaseScheduleContentColors(sch.tag);
      const bg = parseColor(contentStyle.bg_color || baseColors.bg.hex);
      const fg = parseColor(contentStyle.font_color || baseColors.fg.hex);
      setContentStyleEnabled(true);
      setContentFontWeight(contentStyle.font_weight || "normal");
      setContentIsItalic(Boolean(contentStyle.is_italic));
      setContentIsUnderline(Boolean(contentStyle.is_underline));
      setContentIsStrikethrough(Boolean(contentStyle.is_strikethrough));
      setContentFontSize(
        typeof contentStyle.font_size === "number" &&
          Number.isFinite(contentStyle.font_size)
          ? Math.max(8, Math.min(28, contentStyle.font_size))
          : 14,
      );
      setContentFontSizePicker(
        typeof contentStyle.font_size === "number" &&
          Number.isFinite(contentStyle.font_size)
          ? Math.max(8, Math.min(28, contentStyle.font_size))
          : 14,
      );
      setContentTextAlign(
        contentStyle.text_align === "left" ||
          contentStyle.text_align === "right" ||
          contentStyle.text_align === "center"
          ? contentStyle.text_align
          : "center",
      );
      setContentBgColor(bg.hex);
      setContentBgAlpha(bg.alpha);
      setContentBgPickerColor(bg.hex);
      setContentBgPickerAlpha(bg.alpha);
      setContentFontColor(fg.hex);
      setContentFontAlpha(fg.alpha);
      setContentFontPickerColor(fg.hex);
      setContentFontPickerAlpha(fg.alpha);
    } else {
      resetContentStyleState(sch.tag);
    }
    setCollabMembers(sch.collab_members?.join(", ") || "");
    setImageUrl(sch.image_url || null);
    const v = sch.meta?.venue;
    setVenue(v === "home" || v === "away" ? v : "");
    setError("");
    setMode("edit");
  };

  useLayoutEffect(() => {
    if (!initialEditScheduleId || !isAdmin) return;
    const target = popupSchedules.find(
      (schedule) => schedule.id === initialEditScheduleId,
    );
    if (!target) return;
    startEdit(target);
    onInitialEditHandled?.();
  }, [initialEditScheduleId, isAdmin, onInitialEditHandled, popupSchedules]);

  const handleUpload = async (file: File) => {
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "이미지 업로드 실패");
        return;
      }
      setImageUrl(d.url);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const meta: Schedule["meta"] = { ...editingMeta };
      if (showVenue && venue) meta.venue = venue;
      else delete meta.venue;
      if (timeNote.trim()) {
        meta.time_note = timeNote.trim();
        meta.time_note_position = meta.time_note_position ?? "before";
        meta.time_note_gap = meta.time_note_gap ?? 1;
      } else {
        delete meta.time_note;
        delete meta.time_note_position;
        delete meta.time_note_gap;
      }
      // 메모가 비면 메모 관련 메타도 제거
      if (!memo.trim()) {
        delete meta.memo_position;
        delete meta.memo_gap;
      }
      if (contentStyleEnabled) {
        meta.content_style = {
          font_weight: contentFontWeight,
          is_italic: contentIsItalic,
          is_underline: contentIsUnderline,
          is_strikethrough: contentIsStrikethrough,
          font_size: Math.max(8, Math.min(28, contentFontSize)),
          font_color: combineColor(contentFontColor, contentFontAlpha),
          bg_color: combineColor(contentBgColor, contentBgAlpha),
          text_align: contentTextAlign,
        };
      } else {
        delete meta.content_style;
      }
      const normalizedContentRichSegments = normalizeRichTextSegments(
        contentRichSegments,
        content.trim() || null,
      );
      if (hasAnyRichTextStyle(normalizedContentRichSegments)) {
        meta.content_rich = normalizedContentRichSegments;
      } else {
        delete meta.content_rich;
      }
      if (timeStyleEnabled) {
        meta.time_style = {
          font_weight: timeFontWeight,
          is_italic: timeIsItalic,
          is_underline: timeIsUnderline,
          is_strikethrough: timeIsStrikethrough,
          font_size: Math.max(8, Math.min(20, timeFontSize)),
          font_color: combineColor(timeFontColor, timeFontAlpha),
          bg_color: combineColor(timeBgColor, timeBgAlpha),
          text_align: timeTextAlign,
        };
      } else {
        delete meta.time_style;
      }

      const payload = {
        date: dateStr,
        time: normalizeTime(time) || null,
        tag_id: selectedTagId || null,
        content: content.trim() || null,
        memo: memo.trim() || null,
        collab_members: collabMembers
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean),
        image_url: imageUrl,
        meta,
      };

      onLocalScheduleMutation();
      const res = editingId
        ? await fetch("/api/schedule", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editingId, ...payload }),
          })
        : await fetch("/api/schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "저장에 실패했습니다.");
        return;
      }
      const savedSchedule = d.schedule as Schedule | undefined;
      if (!savedSchedule) {
        setError("저장된 일정 정보를 불러오지 못했습니다.");
        return;
      }
      const affectedSchedules = Array.isArray(d.schedules)
        ? (d.schedules as Schedule[])
        : [savedSchedule];
      const affectedSchedulesById = new Map(
        affectedSchedules.map((schedule) => [schedule.id, schedule]),
      );
      setPopupSchedules((prev) => {
        const remaining = prev.filter(
          (schedule) => !affectedSchedulesById.has(schedule.id),
        );
        return sortSchedulesForDisplay([...remaining, ...affectedSchedules]);
      });
      onScheduleSaved(savedSchedule, affectedSchedules);
      resetForm();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = (id: string) => {
    setError("");
    setDeleteTargetId(id);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    setBusy(true);
    try {
      onLocalScheduleMutation();
      const res = await fetch(`/api/schedule?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "삭제에 실패했습니다.");
        return;
      }
      setPopupSchedules((prev) =>
        prev.filter((schedule) => schedule.id !== id),
      );
      if (editingId === id) resetForm();
      setDeleteTargetId(null);
      onScheduleDeleted(id);
    } finally {
      setBusy(false);
    }
  };

  const handleTagSelect = (tag: ScheduleTag, selected: boolean) => {
    setSelectedTagId(selected ? "" : tag.id);
    if (selected || editingId) return;
    if (!time.trim() && tag.default_time) setTime(tag.default_time);
    if (!content.trim() && tag.default_content) setContent(tag.default_content);
  };

  const handlePopupScheduleDragEnd = (event: DragEndEvent) => {
    setPopupDraggingId(null);
    if (!event.over) return;

    const activeId = String(event.active.id);
    const overScheduleId = String(event.over.id);
    if (activeId === overScheduleId) return;
    const activeIndex = popupSchedules.findIndex((s) => s.id === activeId);
    const overIndex = popupSchedules.findIndex((s) => s.id === overScheduleId);
    if (activeIndex < 0 || overIndex < 0) return;

    const next = [...popupSchedules];
    const [moved] = next.splice(activeIndex, 1);
    next.splice(overIndex, 0, moved);
    const reordered = next.map((schedule, index) => ({
      ...schedule,
      sort_order: index,
    }));

    setPopupSchedules(reordered);

    const items = reordered.map((schedule) => ({
      id: schedule.id,
      sort_order: schedule.sort_order,
    }));

    onLocalScheduleMutation();
    fetch("/api/schedule/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
      .then((res) => {
        if (!res.ok) {
          setPopupSchedules(schedules);
          alert("일정 순서 저장에 실패했습니다.");
          return;
        }
        onSchedulesReordered(reordered);
      })
      .catch(() => {
        setPopupSchedules(schedules);
        alert("일정 순서 저장에 실패했습니다.");
      });
  };

  const renderTimeStyleControls = () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-bold text-[var(--text-secondary)]">
          시간 스타일
        </label>
        <button
          type="button"
          onClick={resetTimeStyleState}
          className="rounded-lg px-2 py-1 text-xs text-[var(--text-secondary)] transition hover:bg-dunggeure-lighter/30 hover:text-dunggeure-primary"
        >
          기본 스타일 사용
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            enableTimeStyle();
            setTimeFontWeight((value) =>
              value === "bold" ? "normal" : "bold",
            );
          }}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-bold transition ${
            timeStyleEnabled && timeFontWeight === "bold"
              ? "border-dunggeure-primary bg-dunggeure-primary text-white"
              : "border-[var(--border)] bg-[var(--bg)] hover:border-dunggeure-light"
          }`}
          aria-pressed={timeStyleEnabled && timeFontWeight === "bold"}
        >
          B
        </button>
        <button
          type="button"
          onClick={() => {
            enableTimeStyle();
            setTimeIsItalic((value) => !value);
          }}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm italic transition ${
            timeStyleEnabled && timeIsItalic
              ? "border-dunggeure-primary bg-dunggeure-primary text-white"
              : "border-[var(--border)] bg-[var(--bg)] hover:border-dunggeure-light"
          }`}
          aria-pressed={timeStyleEnabled && timeIsItalic}
        >
          I
        </button>
        <button
          type="button"
          onClick={() => {
            enableTimeStyle();
            setTimeIsUnderline((value) => !value);
          }}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm underline transition ${
            timeStyleEnabled && timeIsUnderline
              ? "border-dunggeure-primary bg-dunggeure-primary text-white"
              : "border-[var(--border)] bg-[var(--bg)] hover:border-dunggeure-light"
          }`}
          aria-pressed={timeStyleEnabled && timeIsUnderline}
        >
          U
        </button>
        <button
          type="button"
          onClick={() => {
            enableTimeStyle();
            setTimeIsStrikethrough((value) => !value);
          }}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm line-through transition ${
            timeStyleEnabled && timeIsStrikethrough
              ? "border-dunggeure-primary bg-dunggeure-primary text-white"
              : "border-[var(--border)] bg-[var(--bg)] hover:border-dunggeure-light"
          }`}
          aria-pressed={timeStyleEnabled && timeIsStrikethrough}
        >
          S
        </button>
        <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
          크기
          <input
            type="number"
            min={8}
            max={20}
            value={timeFontSize}
            onChange={(e) => {
              enableTimeStyle();
              setTimeFontSize(Number(e.target.value) || 14);
            }}
            className="h-8 w-16 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-sm outline-none transition focus:border-dunggeure-primary"
          />
        </label>
        <div className="flex items-center gap-1">
          {(
            [
              { value: "left", label: "왼쪽 정렬", icon: AlignLeft },
              { value: "center", label: "가운데 정렬", icon: AlignCenter },
              { value: "right", label: "오른쪽 정렬", icon: AlignRight },
            ] as const
          ).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                enableTimeStyle();
                setTimeTextAlign(value);
              }}
              className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                timeStyleEnabled && timeTextAlign === value
                  ? "border-dunggeure-primary bg-dunggeure-primary text-white"
                  : "border-[var(--border)] bg-[var(--bg)] hover:border-dunggeure-light"
              }`}
              aria-label={label}
              aria-pressed={timeStyleEnabled && timeTextAlign === value}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ColorField
          label="시간 배경색"
          hex={visibleTimeBgColor.hex}
          alpha={visibleTimeBgColor.alpha}
          onChange={(hex, alpha) => {
            enableTimeStyle();
            setTimeBgColor(hex);
            setTimeBgAlpha(alpha);
          }}
          onReset={() => {
            enableTimeStyle();
            setTimeBgColor("#ffffff");
            setTimeBgAlpha(0);
          }}
        />
        <ColorField
          label="시간 폰트색"
          hex={visibleTimeFontColor.hex}
          alpha={visibleTimeFontColor.alpha}
          onChange={(hex, alpha) => {
            enableTimeStyle();
            setTimeFontColor(hex);
            setTimeFontAlpha(alpha);
          }}
          onReset={() => {
            enableTimeStyle();
            setTimeFontColor("#612DD4");
            setTimeFontAlpha(1);
          }}
        />
      </div>
      <div
        className="rounded-lg px-3 py-2 text-sm"
        style={{
          backgroundColor: timeStyleEnabled
            ? combineColor(timeBgColor, timeBgAlpha)
            : "transparent",
          color: timeStyleEnabled
            ? combineColor(timeFontColor, timeFontAlpha)
            : "#612DD4",
          fontWeight: timeStyleEnabled ? timeFontWeight : "bold",
          fontStyle: timeStyleEnabled && timeIsItalic ? "italic" : "normal",
          textDecoration: timeStyleEnabled
            ? [
                timeIsUnderline && "underline",
                timeIsStrikethrough && "line-through",
              ]
                .filter(Boolean)
                .join(" ") || "none"
            : "none",
          fontSize: timeStyleEnabled
            ? `${Math.max(8, Math.min(20, timeFontSize))}px`
            : undefined,
          textAlign: timeStyleEnabled ? timeTextAlign : "center",
        }}
      >
        {time.trim() || "예: 7PM"}
      </div>
    </div>
  );

  const renderTimeNoteControls = () => (
    <div className="space-y-2.5">
      <div>
        <div className="mb-1 text-[11px] font-bold text-[var(--text-secondary)]">
          표시 위치
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { v: "before" as const, label: "시간 위" },
            { v: "after" as const, label: "시간 아래" },
          ].map((opt) => {
            const current = editingMeta.time_note_position ?? "before";
            const selected = current === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() =>
                  setEditingMeta((meta) => ({
                    ...meta,
                    time_note_position: opt.v,
                  }))
                }
                className={`rounded-md border px-2 py-1 text-xs font-bold transition ${
                  selected
                    ? "border-dunggeure-primary bg-dunggeure-primary text-white shadow-sm"
                    : "border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)] hover:border-dunggeure-light hover:text-dunggeure-primary"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="mb-1 text-[11px] font-bold text-[var(--text-secondary)]">
          빈 줄
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {([1, 2] as const).map((gap) => {
            const current = editingMeta.time_note_gap ?? 1;
            const selected = current === gap;
            return (
              <button
                key={gap}
                type="button"
                onClick={() =>
                  setEditingMeta((meta) => ({
                    ...meta,
                    time_note_gap: gap,
                  }))
                }
                className={`rounded-md border px-2 py-1 text-xs font-bold transition ${
                  selected
                    ? "border-dunggeure-primary bg-dunggeure-primary text-white shadow-sm"
                    : "border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)] hover:border-dunggeure-light hover:text-dunggeure-primary"
                }`}
              >
                {gap}줄
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  const getContentStyleRange = (
    scope: "selection" | "all" = contentStyleScope,
    rangeOverride?: TextSelectionRange | null,
  ): TextSelectionRange | null => {
    if (scope === "all") {
      return content.length ? { start: 0, end: content.length } : null;
    }
    return rangeOverride !== undefined
      ? rangeOverride
      : (contentSelectionRange ??
          getTextareaSelection(contentTextareaRef.current));
  };

  const applyContentRichStyle = (patch: ScheduleRichTextStyle) => {
    const textarea = contentTextareaRef.current;
    const range = getContentStyleRange();
    if (!range) return false;
    setContentRichSegments((segments) =>
      applyRichStyleToSelection(segments, content, range, patch),
    );
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(range.start, range.end);
    });
    return true;
  };

  const syncContentPickerToWholeStyle = (
    scope = contentStyleScope,
    rangeOverride?: TextSelectionRange | null,
  ) => {
    const range = getContentStyleRange(scope, rangeOverride);
    const baseColors = getBaseScheduleContentColors(selectedTag);
    const wholeBg = contentStyleEnabled
      ? { hex: contentBgColor, alpha: contentBgAlpha }
      : baseColors.bg;
    const wholeFg = contentStyleEnabled
      ? { hex: contentFontColor, alpha: contentFontAlpha }
      : baseColors.fg;
    const bg = getRichSelectionColor(
      contentRichSegments,
      content,
      range,
      "bg_color",
      wholeBg,
    );
    const fg = getRichSelectionColor(
      contentRichSegments,
      content,
      range,
      "font_color",
      wholeFg,
    );
    const fontSize = getRichSelectionFontSize(
      contentRichSegments,
      content,
      range,
      contentStyleEnabled ? contentFontSize : 14,
    );
    setContentBgPickerColor(bg.hex);
    setContentBgPickerAlpha(bg.alpha);
    setContentFontPickerColor(fg.hex);
    setContentFontPickerAlpha(fg.alpha);
    setContentFontSizePicker(fontSize);
  };

  const updateContentSelectionAndPicker = (openPopover = false) => {
    const range = getTextareaSelection(contentTextareaRef.current);
    setContentSelectionRange(range);
    if (range) setContentStyleScope("selection");
    if (openPopover) {
      setShowContentStylePopover(true);
      requestAnimationFrame(updateContentStylePopoverPosition);
    }
    requestAnimationFrame(() =>
      syncContentPickerToWholeStyle(
        range ? "selection" : contentStyleScope,
        range,
      ),
    );
  };

  const contentTextareaSelectionRange = contentSelectionRange;
  const contentStyleSelectionRange = getContentStyleRange();
  const contentBoldPressed = contentStyleSelectionRange
    ? selectedRangeHasRichStyle(
        contentRichSegments,
        content,
        contentStyleSelectionRange,
        "font_weight",
        "bold",
      )
    : contentStyleEnabled && contentFontWeight === "bold";
  const contentItalicPressed = contentStyleSelectionRange
    ? selectedRangeHasRichStyle(
        contentRichSegments,
        content,
        contentStyleSelectionRange,
        "is_italic",
        true,
      )
    : contentStyleEnabled && contentIsItalic;
  const contentUnderlinePressed = contentStyleSelectionRange
    ? selectedRangeHasRichStyle(
        contentRichSegments,
        content,
        contentStyleSelectionRange,
        "is_underline",
        true,
      )
    : contentStyleEnabled && contentIsUnderline;
  const contentStrikethroughPressed = contentStyleSelectionRange
    ? selectedRangeHasRichStyle(
        contentRichSegments,
        content,
        contentStyleSelectionRange,
        "is_strikethrough",
        true,
      )
    : contentStyleEnabled && contentIsStrikethrough;

  const renderContentStyleControls = () => (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-[var(--text-secondary)]">
            내용 스타일
          </label>
          <div className="flex rounded-lg bg-[var(--bg-secondary)] p-0.5">
            {(
              [
                ["selection", "선택영역"],
                ["all", "전체내용"],
              ] as const
            ).map(([scope, label]) => (
              <button
                key={scope}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setContentStyleScope(scope);
                  requestAnimationFrame(() =>
                    syncContentPickerToWholeStyle(scope),
                  );
                }}
                disabled={
                  scope === "selection" && !contentTextareaSelectionRange
                }
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition disabled:opacity-40 ${
                  contentStyleScope === scope
                    ? "bg-dunggeure-primary text-white"
                    : "text-[var(--text-secondary)] hover:text-dunggeure-primary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => resetContentStyleState(selectedTag)}
          className="rounded-lg px-2 py-1 text-xs text-[var(--text-secondary)] transition hover:bg-dunggeure-lighter/30 hover:text-dunggeure-primary"
        >
          태그 스타일 사용
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const range = getContentStyleRange();
            if (range) {
              const active = selectedRangeHasRichStyle(
                contentRichSegments,
                content,
                range,
                "font_weight",
                "bold",
              );
              applyContentRichStyle({
                font_weight: active ? undefined : "bold",
              });
              return;
            }
            enableContentStyle();
            setContentFontWeight((value) =>
              value === "bold" ? "normal" : "bold",
            );
          }}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-bold transition ${
            contentBoldPressed
              ? "border-dunggeure-primary bg-dunggeure-primary text-white"
              : "border-[var(--border)] bg-[var(--bg)] hover:border-dunggeure-light"
          }`}
          aria-pressed={contentBoldPressed}
        >
          B
        </button>
        <button
          type="button"
          onClick={() => {
            const range = getContentStyleRange();
            if (range) {
              const active = selectedRangeHasRichStyle(
                contentRichSegments,
                content,
                range,
                "is_italic",
                true,
              );
              applyContentRichStyle({ is_italic: active ? undefined : true });
              return;
            }
            enableContentStyle();
            setContentIsItalic((value) => !value);
          }}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm italic transition ${
            contentItalicPressed
              ? "border-dunggeure-primary bg-dunggeure-primary text-white"
              : "border-[var(--border)] bg-[var(--bg)] hover:border-dunggeure-light"
          }`}
          aria-pressed={contentItalicPressed}
        >
          I
        </button>
        <button
          type="button"
          onClick={() => {
            const range = getContentStyleRange();
            if (range) {
              const active = selectedRangeHasRichStyle(
                contentRichSegments,
                content,
                range,
                "is_underline",
                true,
              );
              applyContentRichStyle({
                is_underline: active ? undefined : true,
              });
              return;
            }
            enableContentStyle();
            setContentIsUnderline((value) => !value);
          }}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm underline transition ${
            contentUnderlinePressed
              ? "border-dunggeure-primary bg-dunggeure-primary text-white"
              : "border-[var(--border)] bg-[var(--bg)] hover:border-dunggeure-light"
          }`}
          aria-pressed={contentUnderlinePressed}
        >
          U
        </button>
        <button
          type="button"
          onClick={() => {
            const range = getContentStyleRange();
            if (range) {
              const active = selectedRangeHasRichStyle(
                contentRichSegments,
                content,
                range,
                "is_strikethrough",
                true,
              );
              applyContentRichStyle({
                is_strikethrough: active ? undefined : true,
              });
              return;
            }
            enableContentStyle();
            setContentIsStrikethrough((value) => !value);
          }}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm line-through transition ${
            contentStrikethroughPressed
              ? "border-dunggeure-primary bg-dunggeure-primary text-white"
              : "border-[var(--border)] bg-[var(--bg)] hover:border-dunggeure-light"
          }`}
          aria-pressed={contentStrikethroughPressed}
        >
          S
        </button>
        <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
          크기
          <input
            type="number"
            min={8}
            max={28}
            value={contentFontSizePicker}
            onChange={(e) => {
              const nextFontSize = Math.max(
                8,
                Math.min(28, Number(e.target.value) || 14),
              );
              setContentFontSizePicker(nextFontSize);
              if (
                applyContentRichStyle({
                  font_size: nextFontSize,
                })
              ) {
                return;
              }
              enableContentStyle();
              setContentFontSize(nextFontSize);
            }}
            className="h-8 w-16 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-sm outline-none transition focus:border-dunggeure-primary"
          />
        </label>
        <div className="flex items-center gap-1">
          {(
            [
              { value: "left", label: "왼쪽 정렬", icon: AlignLeft },
              { value: "center", label: "가운데 정렬", icon: AlignCenter },
              { value: "right", label: "오른쪽 정렬", icon: AlignRight },
            ] as const
          ).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                enableContentStyle();
                setContentTextAlign(value);
              }}
              className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                contentStyleEnabled && contentTextAlign === value
                  ? "border-dunggeure-primary bg-dunggeure-primary text-white"
                  : "border-[var(--border)] bg-[var(--bg)] hover:border-dunggeure-light"
              }`}
              aria-label={label}
              aria-pressed={contentStyleEnabled && contentTextAlign === value}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ColorField
          label="내용 배경색"
          hex={visibleContentBgColor.hex}
          alpha={visibleContentBgColor.alpha}
          onChange={(hex, alpha) => {
            setContentBgPickerColor(hex);
            setContentBgPickerAlpha(alpha);
            if (applyContentRichStyle({ bg_color: combineColor(hex, alpha) })) {
              return;
            }
            enableContentStyle();
            setContentBgColor(hex);
            setContentBgAlpha(alpha);
          }}
          onReset={() => {
            const base = getBaseScheduleContentColors(selectedTag);
            setContentBgPickerColor(base.bg.hex);
            setContentBgPickerAlpha(base.bg.alpha);
            if (applyContentRichStyle({ bg_color: undefined })) {
              return;
            }
            enableContentStyle();
            setContentBgColor(base.bg.hex);
            setContentBgAlpha(base.bg.alpha);
          }}
        />
        <ColorField
          label="내용 폰트색"
          hex={visibleContentFontColor.hex}
          alpha={visibleContentFontColor.alpha}
          onChange={(hex, alpha) => {
            setContentFontPickerColor(hex);
            setContentFontPickerAlpha(alpha);
            if (
              applyContentRichStyle({ font_color: combineColor(hex, alpha) })
            ) {
              return;
            }
            enableContentStyle();
            setContentFontColor(hex);
            setContentFontAlpha(alpha);
          }}
          onReset={() => {
            const base = getBaseScheduleContentColors(selectedTag);
            setContentFontPickerColor(base.fg.hex);
            setContentFontPickerAlpha(base.fg.alpha);
            if (applyContentRichStyle({ font_color: undefined })) {
              return;
            }
            enableContentStyle();
            setContentFontColor(base.fg.hex);
            setContentFontAlpha(base.fg.alpha);
          }}
        />
      </div>
      <div
        className="rounded-lg px-3 py-2 text-center text-sm"
        style={{
          backgroundColor: contentStyleEnabled
            ? combineColor(contentBgColor, contentBgAlpha)
            : selectedTag?.bg_color || "transparent",
          color: contentStyleEnabled
            ? combineColor(contentFontColor, contentFontAlpha)
            : selectedTag?.font_color || "var(--text)",
          fontWeight: contentStyleEnabled ? contentFontWeight : "bold",
          fontStyle:
            contentStyleEnabled && contentIsItalic ? "italic" : "normal",
          textDecoration: contentStyleEnabled
            ? [
                contentIsUnderline && "underline",
                contentIsStrikethrough && "line-through",
              ]
                .filter(Boolean)
                .join(" ") || "none"
            : "none",
          fontSize: contentStyleEnabled
            ? `${Math.max(8, Math.min(28, contentFontSize))}px`
            : undefined,
          textAlign: contentStyleEnabled ? contentTextAlign : "center",
        }}
      >
        <RichTextContent
          segments={contentRichSegments}
          fallback={content.trim() || "미리보기 텍스트"}
        />
      </div>
    </div>
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        onPointerDown={(event) => {
          dayPopupBackdropPointerDownRef.current =
            event.target === event.currentTarget;
        }}
        onClick={(event) => {
          if (
            event.target === event.currentTarget &&
            dayPopupBackdropPointerDownRef.current
          ) {
            onClose();
          }
          dayPopupBackdropPointerDownRef.current = false;
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 22, scale: 0.965 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            duration: 0.34,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="flex max-h-[calc(100dvh-1rem)] min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-[var(--card)] font-hakgyoansimnadeuri shadow-2xl sm:max-h-[95vh] sm:w-[60vw]"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={handleDayPopupTouchStart}
          onTouchEnd={handleDayPopupTouchEnd}
          onTouchCancel={handleDayPopupTouchCancel}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] p-4">
            {mode === "offset" ? (
              <button
                onClick={() => setMode("edit")}
                className="flex items-center gap-1 text-sm text-dunggeure-primary hover:underline"
              >
                <ChevronLeft size={16} /> 뒤로가기
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={goToPreviousDay}
                  className="rounded-lg p-1.5 text-dunggeure-primary transition hover:bg-dunggeure-lighter/30"
                  aria-label="어제로 이동"
                  title="어제로 이동"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="flex min-w-[10rem] flex-col items-center">
                  <h3 className="text-center font-bold text-dunggeure-dark">
                    {format(day, "yyyy년 M월 d일 (EEE)", { locale: ko })}
                  </h3>
                  {holidayBadgeLabel && (
                    <span
                      className="mt-1 rounded-full bg-dunggeure-tertiary/10 px-2 py-0.5 text-xs font-bold text-dunggeure-tertiary"
                      title={holidayBadgeLabel}
                    >
                      {holidayBadgeLabel}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={goToNextDay}
                  className="rounded-lg p-1.5 text-dunggeure-primary transition hover:bg-dunggeure-lighter/30"
                  aria-label="내일로 이동"
                  title="내일로 이동"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-1 hover:bg-dunggeure-lighter/30 rounded-lg transition"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto overflow-x-hidden p-4">
            {mode === "view" && (
              <AnimatePresence
                custom={daySlideDirection}
                initial={false}
                mode="wait"
              >
                <motion.div
                  key={dateStr}
                  custom={daySlideDirection}
                  variants={dayPopupContentVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-3"
                >
                  {popupSchedules.length === 0 ? (
                    <p className="text-center text-sm text-[var(--text-secondary)] py-8">
                      등록된 일정이 없습니다.
                    </p>
                  ) : (
                    popupSchedules.map((sch) => (
                      <div
                        key={sch.id}
                        ref={(node) => {
                          if (node) {
                            highlightedScheduleRefs.current.set(sch.id, node);
                          } else {
                            highlightedScheduleRefs.current.delete(sch.id);
                          }
                        }}
                        className={`rounded-xl border border-[var(--border)] p-4 transition-shadow duration-700 ease-out ${
                          highlightedScheduleId === sch.id
                            ? "schedule-highlight-glow-pulse"
                            : ""
                        }`}
                        style={{
                          ...buildScheduleTagBorderStyle(sch.tag),
                          backgroundColor: getScheduleTagTint(sch.tag, 0.18),
                        }}
                      >
                        <div className="flex items-start gap-3">
                          {sch.image_url && (
                            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] sm:h-24 sm:w-24">
                              <LoadingImage
                                src={sch.image_url}
                                alt=""
                                wrapperClassName="h-full w-full items-center justify-center rounded-lg"
                                skeletonClassName="rounded-lg"
                                className="max-h-full max-w-full object-contain"
                              />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex items-start justify-between gap-2">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                {getScheduleDisplayTime(sch) && (
                                  <span className="whitespace-pre-line font-bold text-dunggeure-primary">
                                    {getScheduleDisplayTime(sch)}
                                  </span>
                                )}
                                {sch.tag && (
                                  <span
                                    className="rounded-full px-2 py-0.5 text-xs"
                                    style={buildScheduleTagStyle(sch.tag)}
                                  >
                                    {sch.tag.name}
                                  </span>
                                )}
                              </div>
                              {isAdmin && (
                                <div className="flex shrink-0 gap-1">
                                  <button
                                    onClick={() => startEdit(sch)}
                                    className="rounded p-1 text-dunggeure-primary transition hover:bg-dunggeure-lighter/30"
                                    aria-label="일정 수정"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(sch.id)}
                                    disabled={busy}
                                    className="rounded p-1 text-red-500 transition hover:bg-red-50 disabled:opacity-40"
                                    aria-label="일정 삭제"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )}
                            </div>
                            <p
                              className="break-words rounded px-1 py-0.5 text-sm"
                              style={buildScheduleContentStyle(
                                getScheduleContentStyle(sch.meta),
                              )}
                            >
                              {sch.meta?.venue === "home" && "[홈] "}
                              {sch.meta?.venue === "away" && "[원정] "}
                              <RichTextContent
                                segments={getScheduleContentRichSegments(sch)}
                                fallback={sch.content}
                              />
                            </p>
                            {sch.collab_members?.length > 0 && (
                              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                                w. {sch.collab_members.join(", ")}
                              </p>
                            )}
                            {sch.memo?.trim() && (
                              <p className="mt-1 whitespace-pre-wrap break-words text-xs text-[var(--text-secondary)]">
                                ✦ <LinkifiedText text={sch.memo.trim()} />
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => {
                        resetForm();
                        setMode("edit");
                      }}
                      className="w-full py-2 text-sm text-dunggeure-primary border border-dashed border-dunggeure-light rounded-xl hover:bg-dunggeure-lighter/30 transition"
                    >
                      + 일정 추가
                    </button>
                  )}
                </motion.div>
              </AnimatePresence>
            )}

            {mode === "edit" && isAdmin && (
              <div className="flex gap-4">
                {/* 입력 영역 (7:3) */}
                <div className="flex-[7] space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {format(day, "M월 d일")} {editingId ? "(수정)" : "(추가)"}
                    </span>
                    <button
                      onClick={() => setMode("offset")}
                      className="text-xs px-2 py-1 rounded-lg border border-[var(--border)] hover:bg-dunggeure-lighter/30 transition"
                    >
                      태그 오프셋 관리
                    </button>
                  </div>

                  {error && (
                    <div className="p-2 rounded-lg bg-red-50 text-red-600 text-xs">
                      {error}
                    </div>
                  )}

                  {/* 태그 선택 */}
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      태그
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {tags.length === 0 && (
                        <span className="text-xs text-[var(--text-secondary)]">
                          등록된 태그가 없습니다. 우측 상단 &apos;태그 오프셋
                          관리&apos;에서 추가하세요.
                        </span>
                      )}
                      {tags.map((t) => {
                        const selected = selectedTagId === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => handleTagSelect(t, selected)}
                            aria-pressed={selected}
                            className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                              selected
                                ? "ring-2 ring-dunggeure-primary/50 border-transparent shadow"
                                : "border-[var(--border)] hover:border-dunggeure-light"
                            }`}
                            style={{
                              ...buildScheduleTagStyle(t),
                            }}
                          >
                            {t.name}
                            {selected && (
                              <span
                                aria-hidden
                                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow"
                              >
                                <Check size={10} strokeWidth={3} />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {showVenue && (
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        장소
                      </label>
                      <div className="flex gap-2">
                        {(
                          [
                            { value: "home", label: "홈" },
                            { value: "away", label: "원정" },
                          ] as const
                        ).map((opt) => {
                          const sel = venue === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setVenue(sel ? "" : opt.value)}
                              aria-pressed={sel}
                              className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                                sel
                                  ? "ring-2 ring-dunggeure-primary/50 border-transparent bg-dunggeure-lighter"
                                  : "border-[var(--border)] hover:border-dunggeure-light"
                              }`}
                            >
                              {opt.label}
                              {sel && (
                                <span
                                  aria-hidden
                                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow"
                                >
                                  <Check size={10} strokeWidth={3} />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 시간 */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs text-[var(--text-secondary)]">
                        시간
                      </label>
                      <KoreanTimeInput
                        inputRef={timeInputRef}
                        value={time}
                        onChange={setTime}
                        onInputFocus={() => {
                          setShowTimeStylePopover(true);
                          requestAnimationFrame(updateTimeStylePopoverPosition);
                        }}
                        inputStyle={{
                          backgroundColor: timeStyleEnabled
                            ? combineColor(timeBgColor, timeBgAlpha)
                            : undefined,
                          color: timeStyleEnabled
                            ? combineColor(timeFontColor, timeFontAlpha)
                            : undefined,
                          fontWeight: timeStyleEnabled
                            ? timeFontWeight
                            : "bold",
                          fontStyle:
                            timeStyleEnabled && timeIsItalic
                              ? "italic"
                              : "normal",
                          textDecoration: timeStyleEnabled
                            ? [
                                timeIsUnderline && "underline",
                                timeIsStrikethrough && "line-through",
                              ]
                                .filter(Boolean)
                                .join(" ") || "none"
                            : "none",
                          fontSize: timeStyleEnabled
                            ? `${Math.max(8, Math.min(20, timeFontSize))}px`
                            : undefined,
                          textAlign: timeStyleEnabled
                            ? timeTextAlign
                            : undefined,
                        }}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-[var(--text-secondary)]">
                        부가 시간 정보
                      </label>
                      <input
                        ref={timeNoteInputRef}
                        type="text"
                        value={timeNote}
                        onChange={(e) => setTimeNote(e.target.value)}
                        onFocus={() => {
                          setShowTimeNotePopover(true);
                          requestAnimationFrame(updateTimeNotePopoverPosition);
                        }}
                        placeholder="예: 설연휴"
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none transition focus:border-dunggeure-primary"
                      />
                    </div>
                  </div>

                  {/* 합방 멤버 */}
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      합방 멤버
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-dunggeure-primary">
                        w.
                      </span>
                      <input
                        type="text"
                        value={collabMembers}
                        onChange={(e) =>
                          setCollabMembers(
                            normalizeCollabMembersInput(e.target.value),
                          )
                        }
                        placeholder="쉼표로 구분 (예: 착한 둥그리, 사악한 둥그리)"
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] py-2 pl-8 pr-3 text-sm outline-none transition focus:border-dunggeure-primary"
                      />
                    </div>
                  </div>

                  {/* 내용 */}
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      내용
                    </label>
                    <textarea
                      ref={contentTextareaRef}
                      value={content}
                      onChange={(e) => {
                        const nextContent = e.target.value;
                        setContentRichSegments((segments) =>
                          reconcileRichTextSegmentsForText(
                            segments,
                            content,
                            nextContent,
                          ),
                        );
                        setContent(nextContent);
                      }}
                      onFocus={() => {
                        updateContentSelectionAndPicker(true);
                      }}
                      onPointerDown={() => {
                        if (!showContentStylePopover) {
                          setShowContentStylePopover(true);
                          requestAnimationFrame(
                            updateContentStylePopoverPosition,
                          );
                        }
                      }}
                      onClick={() => updateContentSelectionAndPicker(true)}
                      onSelect={() => updateContentSelectionAndPicker(true)}
                      onMouseUp={() => updateContentSelectionAndPicker(true)}
                      onKeyUp={() => updateContentSelectionAndPicker(true)}
                      placeholder="일정 내용을 입력하세요"
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm outline-none focus:border-dunggeure-primary transition resize-none"
                    />
                  </div>

                  {/* 메모 */}
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      메모
                    </label>
                    <textarea
                      value={memo}
                      onChange={(e) => setMemo(e.target.value)}
                      placeholder="툴팁에 표시할 메모를 입력하세요"
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm outline-none focus:border-dunggeure-primary transition resize-none"
                    />
                    {memo.trim() &&
                      (showVenue && venue
                        ? true
                        : collabMembers
                            .split(",")
                            .map((m) => m.trim())
                            .filter(Boolean).length > 0) && (
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-[var(--text-secondary)]">
                          <span className="font-medium">툴팁 위치</span>
                          <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg)] p-0.5">
                            {[
                              { v: "before" as const, label: "메모 앞" },
                              { v: "after" as const, label: "메모 뒤" },
                            ].map((opt) => {
                              const current =
                                editingMeta.memo_position ?? "after";
                              const sel = current === opt.v;
                              return (
                                <button
                                  key={opt.v}
                                  type="button"
                                  onClick={() =>
                                    setEditingMeta((m) => ({
                                      ...m,
                                      memo_position: opt.v,
                                    }))
                                  }
                                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                                    sel
                                      ? "bg-dunggeure-primary text-white shadow-sm"
                                      : "text-[var(--text-secondary)] hover:bg-dunggeure-lighter/30 hover:text-dunggeure-primary"
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                          <span className="font-medium">빈 줄</span>
                          <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg)] p-0.5">
                            {([1, 2] as const).map((g) => {
                              const current = editingMeta.memo_gap ?? 2;
                              const sel = current === g;
                              return (
                                <button
                                  key={g}
                                  type="button"
                                  onClick={() =>
                                    setEditingMeta((m) => ({
                                      ...m,
                                      memo_gap: g,
                                    }))
                                  }
                                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                                    sel
                                      ? "bg-dunggeure-primary text-white shadow-sm"
                                      : "text-[var(--text-secondary)] hover:bg-dunggeure-lighter/30 hover:text-dunggeure-primary"
                                  }`}
                                >
                                  {g}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                  </div>

                  {/* 이미지 업로드 */}
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      이미지 (선택, 최대 5MB · jpeg/png/webp/gif)
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-dunggeure-primary text-dunggeure-primary cursor-pointer hover:bg-dunggeure-lighter/30 transition ${
                          uploading ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                      >
                        <Plus size={12} />
                        {imageUrl ? "이미지 변경" : "이미지 선택"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          disabled={uploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUpload(f);
                            e.target.value = "";
                          }}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowStickerPicker(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-dunggeure-primary text-dunggeure-primary hover:bg-dunggeure-lighter/30 transition"
                      >
                        스티커 선택
                      </button>
                      {uploading && (
                        <span className="text-xs text-[var(--text-secondary)]">
                          업로드 중...
                        </span>
                      )}
                    </div>
                    {/* 고정 높이 미리보기 영역: 이미지 유무에 관계없이 같은 높이 → 모달 흔들림 방지 */}
                    <div className="mt-2 h-20 w-20 rounded border border-[var(--border)] bg-[var(--bg-secondary)] relative flex items-center justify-center overflow-hidden">
                      {imageUrl ? (
                        <>
                          <img
                            src={imageUrl}
                            alt="첨부 이미지"
                            className="max-h-full max-w-full object-contain"
                          />
                          <button
                            type="button"
                            onClick={() => setImageUrl(null)}
                            className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-500/90 text-white flex items-center justify-center hover:bg-red-600 transition shadow"
                            aria-label="이미지 제거"
                          >
                            <X size={8} />
                          </button>
                        </>
                      ) : (
                        <span className="text-[10px] text-[var(--text-secondary)]">
                          미리보기
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 액션 버튼 */}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={resetForm}
                      className="h-10 shrink-0 whitespace-nowrap px-4 text-sm rounded-lg border border-[var(--border)] hover:bg-dunggeure-lighter/30 transition"
                    >
                      초기화
                    </button>
                    <button
                      onClick={() => {
                        resetForm();
                        setMode("view");
                      }}
                      className="h-10 shrink-0 whitespace-nowrap px-4 text-sm rounded-lg border border-[var(--border)] hover:bg-dunggeure-lighter/30 transition"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={busy}
                      className="h-10 min-w-0 flex-1 whitespace-nowrap px-3 text-sm rounded-lg bg-dunggeure-primary text-white hover:bg-dunggeure-dark transition disabled:opacity-50"
                    >
                      {busy ? "저장 중..." : editingId ? "수정" : "추가"}
                    </button>
                  </div>
                </div>

                {/* 현재 일정 목록 (3) */}
                <div className="flex-[3] border-l border-[var(--border)] pl-4">
                  <h4 className="text-xs font-bold text-[var(--text-secondary)] mb-2">
                    현재 일정
                  </h4>
                  {popupSchedules.length === 0 ? (
                    <p className="text-xs text-[var(--text-secondary)]">
                      아직 추가된 일정이 없습니다.
                    </p>
                  ) : (
                    <DndContext
                      sensors={popupSensors}
                      onDragStart={(event) => {
                        setPopupDraggingId(String(event.active.id));
                      }}
                      onDragEnd={handlePopupScheduleDragEnd}
                      onDragCancel={() => {
                        setPopupDraggingId(null);
                      }}
                    >
                      <SortableContext
                        items={popupSchedules.map((sch) => sch.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {popupSchedules.map((sch) => (
                            <PopupScheduleCurrentItem
                              key={sch.id}
                              schedule={sch}
                              busy={busy}
                              isDragging={popupDraggingId === sch.id}
                              onEdit={startEdit}
                              onDelete={handleDelete}
                            />
                          ))}
                        </div>
                      </SortableContext>
                      <DragOverlay dropAnimation={null}>
                        {popupActiveSchedule ? (
                          <div className="rounded-lg bg-[var(--card)] px-3 py-2 text-xs font-bold shadow-xl">
                            <span className="text-dunggeure-primary">
                              {getScheduleDisplayTime(popupActiveSchedule) ||
                                "-"}
                            </span>
                            <span className="ml-2">
                              {popupActiveSchedule.content || "(내용 없음)"}
                            </span>
                          </div>
                        ) : null}
                      </DragOverlay>
                    </DndContext>
                  )}
                </div>
              </div>
            )}

            {mode === "offset" && (
              <OffsetManager tags={tags} onChanged={onTagsChanged} />
            )}
          </div>
        </motion.div>
      </motion.div>
      {showTimeStylePopover &&
        timeStylePopoverPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={timeStylePopoverRef}
            role="dialog"
            aria-label="시간 스타일"
            style={{
              position: "fixed",
              top: timeStylePopoverPos.top,
              left: timeStylePopoverPos.left,
              width: timeStylePopoverPos.width,
            }}
            className="z-[80] rounded-2xl border border-dunggeure-light/70 bg-[var(--card)] p-3 font-hakgyoansimnadeuri shadow-2xl"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {renderTimeStyleControls()}
          </div>,
          document.body,
        )}
      {showTimeNotePopover &&
        timeNotePopoverPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={timeNotePopoverRef}
            role="dialog"
            aria-label="부가 시간 정보 설정"
            style={{
              position: "fixed",
              top: timeNotePopoverPos.top,
              left: timeNotePopoverPos.left,
              width: timeNotePopoverPos.width,
            }}
            className="z-[80] rounded-2xl border border-dunggeure-light/70 bg-[var(--card)] p-3 font-hakgyoansimnadeuri shadow-2xl"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {renderTimeNoteControls()}
          </div>,
          document.body,
        )}
      {showContentStylePopover &&
        contentStylePopoverPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={contentStylePopoverRef}
            role="dialog"
            aria-label="내용 스타일"
            style={{
              position: "fixed",
              top: contentStylePopoverPos.top,
              left: contentStylePopoverPos.left,
              width: contentStylePopoverPos.width,
            }}
            className="z-[80] rounded-2xl border border-dunggeure-light/70 bg-[var(--card)] p-3 font-hakgyoansimnadeuri shadow-2xl"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {renderContentStyleControls()}
          </div>,
          document.body,
        )}
      {showStickerPicker && (
        <StickerPicker
          isAdmin={isAdmin}
          onPick={(url) => {
            setImageUrl(url);
            setShowStickerPicker(false);
          }}
          onClose={() => setShowStickerPicker(false)}
        />
      )}
      <AppDialog
        open={!!deleteTargetId}
        title="일정 삭제"
        description="이 일정을 삭제할까요? 삭제한 내용은 되돌릴 수 없습니다."
        confirmText="삭제"
        cancelText="취소"
        variant="danger"
        busy={busy}
        onConfirm={confirmDelete}
        onClose={() => {
          if (!busy) setDeleteTargetId(null);
        }}
      />
    </>
  );
}

function PopupScheduleCurrentItem({
  schedule,
  busy,
  isDragging,
  onEdit,
  onDelete,
}: {
  schedule: Schedule;
  busy: boolean;
  isDragging: boolean;
  onEdit: (schedule: Schedule) => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id: schedule.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
      onContextMenu={(event) => event.preventDefault()}
      data-popup-schedule-id={schedule.id}
      className="relative select-none rounded-lg bg-[var(--bg-secondary)] p-2 text-xs outline-none ring-0 transition focus:outline-none focus:ring-0 focus-visible:outline-none"
    >
      <div className="flex items-start gap-1.5">
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="mt-0.5 shrink-0 touch-none cursor-grab rounded p-0.5 text-[var(--text-secondary)] outline-none ring-0 transition hover:bg-dunggeure-lighter/30 hover:text-dunggeure-primary focus:outline-none focus:ring-0 focus-visible:outline-none active:cursor-grabbing"
          aria-label="일정 순서 변경"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={12} />
        </button>
        <div
          className="min-w-0 flex-1 select-none"
          onContextMenu={(event) => event.preventDefault()}
          style={{
            userSelect: "none",
            WebkitUserSelect: "none",
            WebkitTouchCallout: "none",
          }}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="font-bold">
              {displayTime(schedule.time) || "-"}
            </span>
            <div className="flex shrink-0 gap-1">
              <button
                onClick={() => onEdit(schedule)}
                className="text-dunggeure-primary hover:underline"
                aria-label="일정 수정"
              >
                <Edit2 size={10} />
              </button>
              <button
                onClick={() => onDelete(schedule.id)}
                disabled={busy}
                className="text-red-500 hover:underline disabled:opacity-40"
                aria-label="일정 삭제"
              >
                <Trash2 size={10} />
              </button>
            </div>
          </div>
          <p
            className="mt-0.5 select-none whitespace-pre-wrap break-words"
            onContextMenu={(event) => event.preventDefault()}
            style={{
              userSelect: "none",
              WebkitUserSelect: "none",
              WebkitTouchCallout: "none",
            }}
          >
            {schedule.content}
          </p>
        </div>
      </div>
    </div>
  );
}

// ===== 색 + 알파 입력 (portal로 띄우는 RgbaColorPicker) =====
function ColorField({
  label,
  hex,
  alpha,
  onChange,
  onReset,
}: {
  label: string;
  hex: string;
  alpha: number;
  onChange: (hex: string, alpha: number) => void;
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [hexInput, setHexInput] = useState(hex.toUpperCase());

  useEffect(() => {
    setHexInput(hex.toUpperCase());
  }, [hex]);

  // popover 좌표 계산 (스크롤/리사이즈 시 재계산)
  useEffect(() => {
    if (!open) return;
    const POP_WIDTH = Math.min(320, window.innerWidth - 24);
    const POP_HEIGHT = 330; // picker 240 + HEX 입력/메타 영역
    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 12;
      let left = rect.left;
      // 좌우 경계 보정
      left = Math.max(
        margin,
        Math.min(left, window.innerWidth - POP_WIDTH - margin),
      );
      // 미리보기를 가리지 않도록 기본은 트리거 위로 띄운다.
      // 위쪽 공간이 부족할 때만 아래로 내린다.
      const spaceAbove = rect.top - margin;
      const top =
        spaceAbove >= POP_HEIGHT
          ? rect.top - POP_HEIGHT - 8
          : Math.min(window.innerHeight - POP_HEIGHT - margin, rect.bottom + 8);
      setPos({ top, left });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent | TouchEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (triggerRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    document.addEventListener("touchstart", handle);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("touchstart", handle);
    };
  }, [open]);

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="text-xs text-[var(--text-secondary)]">{label}</label>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="rounded p-0.5 text-[var(--text-secondary)] transition hover:bg-dunggeure-lighter/30 hover:text-dunggeure-primary"
            aria-label={`${label} 초기화`}
            title={`${label} 초기화`}
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-8 rounded border border-[var(--border)] cursor-pointer overflow-hidden flex items-center justify-between px-2 text-[10px] text-[var(--text-secondary)] bg-white"
        aria-label={`${label} 선택 (현재 ${hex}, ${Math.round(alpha * 100)}%)`}
      >
        <span
          className="flex-1 h-full -mx-2 mr-2"
          style={{ backgroundColor: combineColor(hex, alpha) }}
        />
        <span className="shrink-0 ml-1">{Math.round(alpha * 100)}%</span>
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: "min(320px, calc(100vw - 1.5rem))",
            }}
            className="z-[100] color-field-pop p-3 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl space-y-2"
          >
            <RgbaColorPicker
              color={hexAlphaToRgba(hex, alpha)}
              onChange={(rgba) => {
                const { hex: nextHex, alpha: nextAlpha } = rgbaToHexAlpha(rgba);
                onChange(nextHex, nextAlpha);
              }}
              style={{ width: "100%", height: 240 }}
            />
            <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
              <span className="font-mono">{hex.toUpperCase()}</span>
              <span>{Math.round(alpha * 100)}%</span>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-[var(--text-secondary)]">
                HEX
              </label>
              <input
                value={hexInput}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setHexInput(nextValue);
                  const nextHex = normalizeHexInput(nextValue);
                  if (nextHex) onChange(nextHex, alpha);
                }}
                onBlur={() => {
                  const nextHex = normalizeHexInput(hexInput);
                  if (nextHex) {
                    onChange(nextHex, alpha);
                    setHexInput(nextHex.toUpperCase());
                    return;
                  }
                  setHexInput(hex.toUpperCase());
                }}
                placeholder="#FFFFFF"
                spellCheck={false}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 font-mono text-xs uppercase outline-none transition focus:border-dunggeure-primary"
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

// ===== 오프셋 관리 =====
function OffsetManager({
  tags,
  onChanged,
}: {
  tags: ScheduleTag[];
  onChanged: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [bgAlpha, setBgAlpha] = useState(1);
  const [fontColor, setFontColor] = useState("#333333");
  const [fontAlpha, setFontAlpha] = useState(1);
  const [borderColor, setBorderColor] = useState("#8080ff");
  const [borderAlpha, setBorderAlpha] = useState(1);
  const [borderStyle, setBorderStyle] =
    useState<ScheduleTagBorderStyle>("none");
  const [fontWeight, setFontWeight] = useState("normal");
  const [fontSize, setFontSize] = useState(14);
  const [textAlign, setTextAlign] = useState<"left" | "center" | "right">(
    "center",
  );
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [defaultTime, setDefaultTime] = useState("");
  const [defaultContent, setDefaultContent] = useState("");
  const [isScheduleDefault, setIsScheduleDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ScheduleTag | null>(null);
  const [orderedTags, setOrderedTags] = useState(() =>
    sortTagsForDisplay(tags),
  );
  const [draggingTagId, setDraggingTagId] = useState<string | null>(null);
  const tagSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
  );

  useEffect(() => {
    setOrderedTags(sortTagsForDisplay(tags));
  }, [tags]);

  const loadTag = (tag: ScheduleTag) => {
    const bg = parseColor(tag.bg_color);
    const fg = parseColor(tag.font_color);
    const border = parseColor(tag.border_color || "#8080ff");
    setEditingId(tag.id);
    setName(tag.name);
    setBgColor(bg.hex);
    setBgAlpha(bg.alpha);
    setFontColor(fg.hex);
    setFontAlpha(fg.alpha);
    setBorderColor(border.hex);
    setBorderAlpha(border.alpha);
    setBorderStyle(
      tag.border_style === "solid" ||
        tag.border_style === "dashed" ||
        tag.border_style === "dotted" ||
        tag.border_style === "double"
        ? tag.border_style
        : "none",
    );
    setFontWeight(tag.font_weight);
    setFontSize(
      typeof tag.font_size === "number" && Number.isFinite(tag.font_size)
        ? Math.max(8, Math.min(28, tag.font_size))
        : 14,
    );
    setTextAlign(
      tag.text_align === "left" ||
        tag.text_align === "right" ||
        tag.text_align === "center"
        ? tag.text_align
        : "center",
    );
    setIsItalic(tag.is_italic);
    setIsUnderline(tag.is_underline);
    setIsStrikethrough(tag.is_strikethrough);
    setDefaultTime(tag.default_time || "");
    setDefaultContent(tag.default_content || "");
    setIsScheduleDefault(Boolean(tag.is_schedule_default));
    setError("");
  };

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setBgColor("#ffffff");
    setBgAlpha(1);
    setFontColor("#333333");
    setFontAlpha(1);
    setBorderColor("#8080ff");
    setBorderAlpha(1);
    setBorderStyle("none");
    setFontWeight("normal");
    setFontSize(14);
    setTextAlign("center");
    setIsItalic(false);
    setIsUnderline(false);
    setIsStrikethrough(false);
    setDefaultTime("");
    setDefaultContent("");
    setIsScheduleDefault(false);
    setError("");
  };

  const handleSubmit = async () => {
    if (!name.trim() || busy) return;
    setError("");
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        bg_color: combineColor(bgColor, bgAlpha),
        font_color: combineColor(fontColor, fontAlpha),
        border_color: combineColor(borderColor, borderAlpha),
        border_style: borderStyle,
        font_weight: fontWeight,
        font_size: fontSize,
        text_align: textAlign,
        is_italic: isItalic,
        is_underline: isUnderline,
        is_strikethrough: isStrikethrough,
        default_time: defaultTime.trim() || null,
        default_content: defaultContent.trim() || null,
        is_schedule_default: isScheduleDefault,
      };
      const res = editingId
        ? await fetch("/api/schedule/tags", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editingId, ...payload }),
          })
        : await fetch("/api/schedule/tags", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "저장에 실패했습니다.");
        return;
      }
      resetForm();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = (tag: ScheduleTag) => {
    if (busy) return;
    setDeleteTarget(tag);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || busy) return;
    const id = deleteTarget.id;
    setBusy(true);
    try {
      const res = await fetch(`/api/schedule/tags?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        if (editingId === id) resetForm();
        onChanged();
      }
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const handleTagDragEnd = (event: DragEndEvent) => {
    setDraggingTagId(null);
    if (!event.over) return;

    const activeId = String(event.active.id);
    const overId = String(event.over.id);
    if (activeId === overId) return;

    const activeIndex = orderedTags.findIndex((tag) => tag.id === activeId);
    const overIndex = orderedTags.findIndex((tag) => tag.id === overId);
    if (activeIndex < 0 || overIndex < 0) return;

    const previousTags = orderedTags;
    const nextTags = arrayMove(orderedTags, activeIndex, overIndex).map(
      (tag, index) => ({ ...tag, sort_order: index }),
    );
    setOrderedTags(nextTags);

    fetch("/api/schedule/tags/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: nextTags.map((tag) => ({
          id: tag.id,
          sort_order: tag.sort_order,
        })),
      }),
    })
      .then((res) => {
        if (!res.ok) {
          setOrderedTags(previousTags);
          alert("태그 순서 저장에 실패했습니다.");
          return;
        }
        onChanged();
      })
      .catch(() => {
        setOrderedTags(previousTags);
        alert("태그 순서 저장에 실패했습니다.");
      });
  };

  return (
    <>
      <div className="grid h-full min-h-0 items-stretch gap-5 font-hakgyoansimnadeuri md:grid-cols-[1.25fr_1fr] md:gap-4">
        {/* 입력 */}
        <div className="min-w-0 space-y-3">
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">
              태그 제목
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm outline-none focus:border-dunggeure-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">
                기본 시간
              </label>
              <KoreanTimeInput value={defaultTime} onChange={setDefaultTime} />
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">
                기본 내용
              </label>
              <input
                value={defaultContent}
                onChange={(e) => setDefaultContent(e.target.value)}
                placeholder="예: 휴방"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm outline-none focus:border-dunggeure-primary"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsScheduleDefault((value) => !value)}
            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition ${
              isScheduleDefault
                ? "border-dunggeure-light bg-dunggeure-primary/10 text-dunggeure-dark"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-dunggeure-light hover:bg-dunggeure-lighter/30"
            }`}
            aria-pressed={isScheduleDefault}
          >
            <span>
              <span className="block font-bold">일정 추가 기본 태그</span>
              <span className="mt-0.5 block">
                켜두면 일정 추가 팝업을 처음 열 때 이 태그가 선택됩니다.
              </span>
            </span>
            <span
              className={`ml-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                isScheduleDefault
                  ? "border-dunggeure-primary bg-dunggeure-primary text-white"
                  : "border-[var(--border)]"
              }`}
              aria-hidden
            >
              {isScheduleDefault && <Check size={12} strokeWidth={3} />}
            </span>
          </button>
          <div className="grid grid-cols-2 gap-3">
            <ColorField
              label="배경색"
              hex={bgColor}
              alpha={bgAlpha}
              onChange={(hex, alpha) => {
                setBgColor(hex);
                setBgAlpha(alpha);
              }}
              onReset={() => {
                setBgColor("#ffffff");
                setBgAlpha(1);
              }}
            />
            <ColorField
              label="폰트색"
              hex={fontColor}
              alpha={fontAlpha}
              onChange={(hex, alpha) => {
                setFontColor(hex);
                setFontAlpha(alpha);
              }}
              onReset={() => {
                setFontColor("#333333");
                setFontAlpha(1);
              }}
            />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-[var(--text-secondary)]">
                테두리 선 모양
              </label>
              <div className="grid grid-cols-5 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-0.5">
                {(
                  [
                    { value: "none", label: "없음" },
                    { value: "solid", label: "실선" },
                    { value: "dashed", label: "파선" },
                    { value: "dotted", label: "점선" },
                    { value: "double", label: "이중" },
                  ] as const
                ).map((option) => {
                  const selected = borderStyle === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setBorderStyle(option.value)}
                      className={`rounded-md px-1 py-1 text-[11px] font-medium transition ${
                        selected
                          ? "bg-dunggeure-primary text-white shadow-sm"
                          : "text-[var(--text-secondary)] hover:bg-dunggeure-lighter/30 hover:text-dunggeure-primary"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <ColorField
              label="테두리 선 색"
              hex={borderColor}
              alpha={borderAlpha}
              onChange={(hex, alpha) => {
                setBorderColor(hex);
                setBorderAlpha(alpha);
              }}
              onReset={() => {
                setBorderColor("#8080ff");
                setBorderAlpha(1);
              }}
            />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-[var(--text-secondary)]">
                폰트 크기
              </label>
              <input
                type="number"
                min={8}
                max={28}
                value={fontSize}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (!Number.isFinite(next)) return;
                  setFontSize(Math.max(8, Math.min(28, next)));
                }}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-dunggeure-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--text-secondary)]">
                정렬
              </label>
              <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg)] p-0.5">
                {(
                  [
                    { value: "left", label: "왼쪽" },
                    { value: "center", label: "가운데" },
                    { value: "right", label: "오른쪽" },
                  ] as const
                ).map((option) => {
                  const selected = textAlign === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTextAlign(option.value)}
                      className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                        selected
                          ? "bg-dunggeure-primary text-white shadow-sm"
                          : "text-[var(--text-secondary)] hover:bg-dunggeure-lighter/30 hover:text-dunggeure-primary"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-1 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={fontWeight === "bold"}
                onChange={(e) =>
                  setFontWeight(e.target.checked ? "bold" : "normal")
                }
                className="accent-dunggeure-primary"
              />
              <strong>굵기</strong>
            </label>
            <label className="flex items-center gap-1 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={isItalic}
                onChange={(e) => setIsItalic(e.target.checked)}
                className="accent-dunggeure-primary"
              />
              <em>기울임</em>
            </label>
            <label className="flex items-center gap-1 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={isUnderline}
                onChange={(e) => setIsUnderline(e.target.checked)}
                className="accent-dunggeure-primary"
              />
              <u>밑줄</u>
            </label>
            <label className="flex items-center gap-1 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={isStrikethrough}
                onChange={(e) => setIsStrikethrough(e.target.checked)}
                className="accent-dunggeure-primary"
              />
              <s>취소선</s>
            </label>
          </div>

          {/* 미리보기 */}
          <div className="p-3 rounded-lg border border-[var(--border)]">
            <span className="text-xs text-[var(--text-secondary)] block mb-1">
              미리보기
            </span>
            <span
              className="block rounded px-2 py-1"
              style={{
                backgroundColor: combineColor(bgColor, bgAlpha),
                color: combineColor(fontColor, fontAlpha),
                fontWeight,
                fontStyle: isItalic ? "italic" : "normal",
                fontSize: `${Math.max(8, Math.min(28, fontSize))}px`,
                textAlign,
                textDecoration:
                  [
                    isUnderline && "underline",
                    isStrikethrough && "line-through",
                  ]
                    .filter(Boolean)
                    .join(" ") || "none",
                border:
                  borderStyle === "none"
                    ? undefined
                    : `1px ${borderStyle} ${combineColor(
                        borderColor,
                        borderAlpha,
                      )}`,
              }}
            >
              {name || "미리보기 텍스트"}
            </span>
          </div>

          {error && (
            <div className="p-2 rounded-lg bg-red-50 text-red-600 text-xs">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            {editingId && (
              <button
                onClick={resetForm}
                className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm hover:bg-dunggeure-lighter/30 transition"
              >
                새 태그
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={!name.trim() || busy}
              className="flex-1 py-2 rounded-lg bg-dunggeure-primary text-white text-sm hover:bg-dunggeure-dark transition disabled:opacity-50"
            >
              {busy ? "저장 중..." : editingId ? "수정" : "추가"}
            </button>
          </div>
        </div>

        {/* 기존 오프셋 목록 */}
        <div className="flex h-full min-h-0 min-w-0 flex-col border-t-2 border-dunggeure-light/70 pt-4 md:border-l md:border-t-0 md:border-[var(--border)] md:pl-4 md:pt-0">
          <h4 className="mb-2 flex items-center gap-1.5 rounded-lg bg-dunggeure-lighter/35 px-2 py-1.5 text-xs font-bold text-[var(--text-secondary)] md:bg-transparent md:px-0 md:py-0">
            <span>기존 오프셋</span>
            <span className="rounded-full bg-dunggeure-lighter px-1.5 py-0.5 text-[10px] text-dunggeure-dark">
              {orderedTags.length}
            </span>
          </h4>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {orderedTags.length === 0 && (
              <p className="text-xs text-[var(--text-secondary)]">
                등록된 태그가 없습니다.
              </p>
            )}
            <DndContext
              sensors={tagSensors}
              onDragStart={(event) => setDraggingTagId(String(event.active.id))}
              onDragEnd={handleTagDragEnd}
              onDragCancel={() => setDraggingTagId(null)}
            >
              <SortableContext
                items={orderedTags.map((tag) => tag.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {orderedTags.map((tag) => (
                    <SortableOffsetTagItem
                      key={tag.id}
                      tag={tag}
                      busy={busy}
                      selected={editingId === tag.id}
                      isDragging={draggingTagId === tag.id}
                      onLoad={loadTag}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </div>
      <AppDialog
        open={Boolean(deleteTarget)}
        title="태그 삭제"
        description={
          deleteTarget
            ? `'${deleteTarget.name}' 태그를 삭제할까요?\n이 태그를 쓰는 일정의 태그가 비워집니다.`
            : ""
        }
        confirmText="삭제"
        cancelText="취소"
        variant="danger"
        busy={busy}
        onConfirm={confirmDelete}
        onClose={() => {
          if (!busy) setDeleteTarget(null);
        }}
      />
    </>
  );
}

function SortableOffsetTagItem({
  tag,
  busy,
  selected,
  isDragging,
  onLoad,
  onDelete,
}: {
  tag: ScheduleTag;
  busy: boolean;
  selected: boolean;
  isDragging: boolean;
  onLoad: (tag: ScheduleTag) => void;
  onDelete: (tag: ScheduleTag) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: sortableDragging,
  } = useSortable({ id: tag.id });

  const textDecoration =
    [tag.is_underline && "underline", tag.is_strikethrough && "line-through"]
      .filter(Boolean)
      .join(" ") || "none";
  const fontSize =
    typeof tag.font_size === "number" && Number.isFinite(tag.font_size)
      ? Math.max(8, Math.min(28, tag.font_size))
      : 14;
  const textAlign =
    tag.text_align === "left" ||
    tag.text_align === "right" ||
    tag.text_align === "center"
      ? tag.text_align
      : "center";

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`flex items-center justify-between rounded-lg border p-2 transition ${
        selected
          ? "border-dunggeure-primary"
          : "border-[var(--border)] hover:border-dunggeure-light"
      } ${isDragging || sortableDragging ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="mr-2 shrink-0 touch-none rounded p-1 text-[var(--text-secondary)] transition hover:bg-dunggeure-lighter/30 hover:text-dunggeure-primary"
        aria-label="태그 순서 변경"
      >
        <GripVertical size={13} />
      </button>
      <button onClick={() => onLoad(tag)} className="min-w-0 flex-1 text-left">
        <span
          className="block rounded px-2 py-0.5"
          style={{
            backgroundColor: tag.bg_color,
            color: tag.font_color,
            fontWeight: tag.font_weight,
            fontStyle: tag.is_italic ? "italic" : "normal",
            fontSize: `${fontSize}px`,
            textAlign,
            textDecoration,
            border:
              tag.border_style && tag.border_style !== "none"
                ? `1px ${tag.border_style} ${tag.border_color || "#8080ff"}`
                : undefined,
          }}
        >
          {tag.name}
        </span>
        {(tag.default_time || tag.default_content) && (
          <div className="mt-1 text-[10px] text-[var(--text-secondary)]">
            {tag.default_time && <span>{displayTime(tag.default_time)}</span>}
            {tag.default_time && tag.default_content && <span> · </span>}
            {tag.default_content && <span>{tag.default_content}</span>}
          </div>
        )}
        {tag.is_schedule_default && (
          <div className="mt-1">
            <span className="rounded-full bg-dunggeure-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-dunggeure-dark">
              일정 추가 기본
            </span>
          </div>
        )}
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => onLoad(tag)}
          className="p-1 text-[var(--text-secondary)] transition hover:text-dunggeure-primary"
          aria-label="태그 수정"
        >
          <Edit2 size={12} />
        </button>
        <button
          onClick={() => onDelete(tag)}
          disabled={busy || tag.is_protected}
          className="p-1 text-[var(--text-secondary)] transition hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={
            tag.is_protected ? "보호된 태그 (삭제 불가)" : "태그 삭제"
          }
          title={
            tag.is_protected ? "보호된 태그는 삭제할 수 없습니다." : undefined
          }
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ===== 스티커 선택 모달 =====
function StickerPicker({
  isAdmin,
  onPick,
  onClose,
}: {
  isAdmin: boolean;
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  type StickerFilter = StickerCategory | "quick" | "all";
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [categories, setCategories] =
    useState<StickerCategoryOption[]>(STICKER_CATEGORIES);
  const [category, setCategory] = useState<StickerFilter>("quick");
  const [recentStickerIds, setRecentStickerIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const parsed = JSON.parse(
        window.localStorage.getItem(STICKER_RECENT_STORAGE_KEY) || "[]",
      );
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // admin 업로드 폼
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadCategory, setUploadCategory] =
    useState<StickerCategory>("dunggeure");
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingSticker, setEditingSticker] = useState<Sticker | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] =
    useState<StickerCategory>("dunggeure");
  const [editingStickerBusy, setEditingStickerBusy] = useState(false);
  const [favoriteLimitDialogOpen, setFavoriteLimitDialogOpen] = useState(false);
  const [deleteStickerTarget, setDeleteStickerTarget] =
    useState<Sticker | null>(null);
  const [deletingSticker, setDeletingSticker] = useState(false);
  const [draggingStickerId, setDraggingStickerId] = useState<string | null>(
    null,
  );
  const getStickerCache = useStickerCacheStore((state) => state.getCache);
  const setStickerCache = useStickerCacheStore((state) => state.setCache);
  const clearStickerCache = useStickerCacheStore((state) => state.clear);

  const stickerSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
  );

  const reload = useCallback(
    (options?: { force?: boolean }) => {
      const cached = options?.force ? null : getStickerCache();
      if (cached) {
        setStickers(cached.stickers);
        setCategories(cached.categories);
        setLoading(false);
      } else {
        setLoading(true);
      }

      Promise.all([
        fetch("/api/stickers").then((r) => r.json()),
        fetch("/api/sticker-categories").then((r) => r.json()),
      ])
        .then(([stickersData, categoriesData]) => {
          const nextStickers = stickersData.stickers || [];
          const nextCategories =
            categoriesData.categories || STICKER_CATEGORIES;
          setStickers(nextStickers);
          setCategories(nextCategories);
          setStickerCache({
            stickers: nextStickers,
            categories: nextCategories,
          });
        })
        .catch(() => {
          if (!cached) {
            setStickers([]);
            setCategories(STICKER_CATEGORIES);
          }
        })
        .finally(() => {
          if (!cached) setLoading(false);
        });
    },
    [getStickerCache, setStickerCache],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (loading) return;

    const availableIds = new Set(stickers.map((sticker) => sticker.id));
    const nextRecentIds = recentStickerIds
      .filter((id) => availableIds.has(id))
      .slice(0, RECENT_STICKER_LIMIT);
    if (nextRecentIds.length === recentStickerIds.length) return;

    setRecentStickerIds(nextRecentIds);
    try {
      window.localStorage.setItem(
        STICKER_RECENT_STORAGE_KEY,
        JSON.stringify(nextRecentIds),
      );
    } catch {
      // Recent stickers are a local convenience only.
    }
  }, [loading, recentStickerIds, stickers]);

  useEffect(() => {
    if (categories.some((c) => c.value === uploadCategory)) return;
    setUploadCategory(categories[0]?.value || "dunggeure");
  }, [categories, uploadCategory]);

  useEffect(() => {
    if (!showUploadForm || category === "all" || category === "quick") {
      return;
    }
    setUploadCategory(category);
  }, [category, showUploadForm]);

  // 미리보기 ObjectURL 정리
  useEffect(() => {
    if (!uploadPreview) return;
    return () => URL.revokeObjectURL(uploadPreview);
  }, [uploadPreview]);

  const handleFilePick = (file: File) => {
    setError("");
    setUploadFile(file);
    setUploadPreview(URL.createObjectURL(file));
  };

  const resetUploadForm = () => {
    setShowUploadForm(false);
    setUploadName("");
    setUploadFile(null);
    setUploadPreview(null);
    setError("");
  };

  const openUploadForm = () => {
    if (category !== "all" && category !== "quick") {
      setUploadCategory(category);
    } else {
      setUploadCategory(categories[0]?.value || "dunggeure");
    }
    setShowUploadForm(true);
  };

  const handleAddCategory = async () => {
    if (!newCategoryLabel.trim() || addingCategory) return;
    setError("");
    setAddingCategory(true);
    try {
      const res = await fetch("/api/sticker-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newCategoryLabel.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.category) {
        setError(data.error || "카테고리 추가에 실패했습니다.");
        return;
      }
      const nextCategory = data.category as StickerCategoryOption;
      const nextCategories = [...categories, nextCategory];
      setCategories(nextCategories);
      setStickerCache({ stickers, categories: nextCategories });
      setCategory(nextCategory.value);
      setUploadCategory(nextCategory.value);
      setNewCategoryLabel("");
      setShowCategoryForm(false);
    } finally {
      setAddingCategory(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      setError("파일을 선택하세요.");
      return;
    }
    if (!uploadName.trim()) {
      setError("이름을 입력하세요.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("category", uploadCategory);
      fd.append("name", uploadName.trim());
      const res = await fetch("/api/stickers", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "업로드 실패");
        return;
      }
      resetUploadForm();
      clearStickerCache();
      reload({ force: true });
    } finally {
      setUploading(false);
    }
  };

  const startStickerEdit = (sticker: Sticker) => {
    setError("");
    setEditingSticker(sticker);
    setEditName(sticker.name);
    setEditCategory(sticker.category);
  };

  const resetStickerEdit = () => {
    setEditingSticker(null);
    setEditName("");
    setEditCategory(categories[0]?.value || "dunggeure");
  };

  const handleUpdateSticker = async () => {
    if (!editingSticker || editingStickerBusy) return;
    if (!editName.trim()) {
      setError("스티커 이름을 입력하세요.");
      return;
    }
    setError("");
    setEditingStickerBusy(true);
    try {
      const res = await fetch("/api/stickers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingSticker.id,
          name: editName.trim(),
          category: editCategory,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.sticker) {
        setError(data.error || "스티커 수정에 실패했습니다.");
        return;
      }
      resetStickerEdit();
      clearStickerCache();
      reload({ force: true });
    } finally {
      setEditingStickerBusy(false);
    }
  };

  const recordRecentSticker = (sticker: Sticker) => {
    setRecentStickerIds((prev) => {
      const next = [
        sticker.id,
        ...prev.filter((id) => id !== sticker.id),
      ].slice(0, RECENT_STICKER_LIMIT);
      try {
        window.localStorage.setItem(
          STICKER_RECENT_STORAGE_KEY,
          JSON.stringify(next),
        );
      } catch {
        // Recent stickers are a local convenience only.
      }
      return next;
    });
  };

  const handlePickSticker = (sticker: Sticker) => {
    recordRecentSticker(sticker);
    onPick(sticker.url);
  };

  const toggleStickerFavorite = async (sticker: Sticker) => {
    const nextFavorite = !sticker.is_favorite;
    const favoriteCount = stickers.filter((item) => item.is_favorite).length;
    if (nextFavorite && favoriteCount >= FAVORITE_STICKER_LIMIT) {
      setFavoriteLimitDialogOpen(true);
      return;
    }

    const optimisticStickers = stickers.map((item) =>
      item.id === sticker.id ? { ...item, is_favorite: nextFavorite } : item,
    );
    setStickers(optimisticStickers);
    setStickerCache({ stickers: optimisticStickers, categories });
    setError("");

    const res = await fetch(
      nextFavorite
        ? "/api/sticker-favorites"
        : `/api/sticker-favorites?sticker_id=${sticker.id}`,
      {
        method: nextFavorite ? "POST" : "DELETE",
        headers: nextFavorite
          ? { "Content-Type": "application/json" }
          : undefined,
        body: nextFavorite ? JSON.stringify({ sticker_id: sticker.id }) : null,
      },
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const revertedStickers = stickers.map((item) =>
        item.id === sticker.id ? { ...item, is_favorite: !nextFavorite } : item,
      );
      setStickers(revertedStickers);
      setStickerCache({ stickers: revertedStickers, categories });
      setError(data.error || "즐겨찾기 저장에 실패했습니다.");
    }
  };

  const handleDelete = (id: string) => {
    const target = stickers.find((sticker) => sticker.id === id);
    if (target) setDeleteStickerTarget(target);
  };

  const confirmDeleteSticker = async () => {
    if (!deleteStickerTarget || deletingSticker) return;

    setDeletingSticker(true);
    setError("");
    const res = await fetch(`/api/stickers?id=${deleteStickerTarget.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setRecentStickerIds((prev) => {
        const next = prev.filter((id) => id !== deleteStickerTarget.id);
        try {
          window.localStorage.setItem(
            STICKER_RECENT_STORAGE_KEY,
            JSON.stringify(next),
          );
        } catch {
          // Recent stickers are a local convenience only.
        }
        return next;
      });
      setDeleteStickerTarget(null);
      clearStickerCache();
      reload({ force: true });
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "스티커 삭제에 실패했습니다.");
    }

    setDeletingSticker(false);
  };

  const stickerById = new Map(stickers.map((sticker) => [sticker.id, sticker]));
  const favoriteStickers = stickers
    .filter((sticker) => sticker.is_favorite)
    .slice(0, FAVORITE_STICKER_LIMIT);
  const favoriteStickerIds = new Set(
    favoriteStickers.map((sticker) => sticker.id),
  );
  const recentStickers = recentStickerIds
    .map((id) => stickerById.get(id))
    .filter(
      (sticker): sticker is Sticker =>
        sticker != null && !favoriteStickerIds.has(sticker.id),
    )
    .slice(0, RECENT_STICKER_LIMIT);
  const filtered =
    category === "quick"
      ? [...favoriteStickers, ...recentStickers]
      : category === "all"
        ? stickers
        : stickers.filter((s) => s.category === category);
  const canReorderStickers =
    isAdmin && category !== "all" && category !== "quick";
  const activeSticker = draggingStickerId
    ? stickers.find((sticker) => sticker.id === draggingStickerId) || null
    : null;
  const categoryOrder = new Map(
    categories.map((item, index) => [item.value, index]),
  );
  const sortStickersByCategory = (items: Sticker[]) =>
    [...items].sort((a, b) => {
      const categoryDiff =
        (categoryOrder.get(a.category) ?? Number.MAX_SAFE_INTEGER) -
        (categoryOrder.get(b.category) ?? Number.MAX_SAFE_INTEGER);
      if (categoryDiff !== 0) return categoryDiff;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.created_at.localeCompare(b.created_at);
    });

  const handleStickerDragEnd = (event: DragEndEvent) => {
    setDraggingStickerId(null);
    if (!canReorderStickers || !event.over) return;

    const activeId = String(event.active.id);
    const overId = String(event.over.id);
    if (activeId === overId) return;

    const oldIndex = filtered.findIndex((sticker) => sticker.id === activeId);
    const newIndex = filtered.findIndex((sticker) => sticker.id === overId);
    if (oldIndex < 0 || newIndex < 0) return;

    const before = stickers;
    const reordered = arrayMove(filtered, oldIndex, newIndex).map(
      (sticker, index) => ({
        ...sticker,
        sort_order: index,
      }),
    );
    const reorderedById = new Map(
      reordered.map((sticker) => [sticker.id, sticker]),
    );

    const nextStickers = sortStickersByCategory(
      stickers.map((sticker) => reorderedById.get(sticker.id) || sticker),
    );
    setStickers(nextStickers);
    setStickerCache({ stickers: nextStickers, categories });

    fetch("/api/stickers/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: reordered.map((sticker) => ({
          id: sticker.id,
          sort_order: sticker.sort_order,
        })),
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setStickers(before);
          setStickerCache({ stickers: before, categories });
          setError(data.error || "스티커 순서 저장에 실패했습니다.");
        }
      })
      .catch(() => {
        setStickers(before);
        setStickerCache({ stickers: before, categories });
        setError("스티커 순서 저장에 실패했습니다.");
      });
  };

  return (
    <div
      className="sticker-picker-pop fixed inset-0 z-[130] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-[var(--card)] font-hakgyoansimnadeuri shadow-2xl sm:max-h-[85vh] sm:w-[62vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] p-4">
          <h3 className="font-bold text-dunggeure-dark">스티커 선택</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-dunggeure-lighter/30 rounded-lg transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-[var(--border)] bg-[var(--card)]">
            {/* 카테고리 칩 */}
            <div className="flex flex-wrap gap-1.5 px-4 pb-2 pt-3">
              <button
                type="button"
                onClick={() => setCategory("quick")}
                className={`flex h-7 min-w-11 items-center justify-center gap-1 rounded-full px-2 text-xs font-medium transition ${
                  category === "quick"
                    ? "bg-dunggeure-primary text-white"
                    : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-dunggeure-lighter/30"
                }`}
                aria-label="즐겨찾기 및 최근 사용"
                title="즐겨찾기 및 최근 사용"
              >
                <Star
                  size={14}
                  fill={category === "quick" ? "currentColor" : "none"}
                />
                <span className="text-[10px] leading-none">/</span>
                <Clock size={14} />
              </button>
              <button
                onClick={() => setCategory("all")}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                  category === "all"
                    ? "bg-dunggeure-primary text-white"
                    : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-dunggeure-lighter/30"
                }`}
              >
                전체
              </button>
              {categories.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setCategory(c.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                    category === c.value
                      ? "bg-dunggeure-primary text-white"
                      : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-dunggeure-lighter/30"
                  }`}
                >
                  {c.label}
                </button>
              ))}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowCategoryForm((v) => !v)}
                  className="flex items-center gap-1 rounded-full border border-dunggeure-primary px-3 py-1 text-xs font-medium text-dunggeure-primary transition hover:bg-dunggeure-lighter/30"
                >
                  <Plus size={11} />
                  카테고리
                </button>
              )}
            </div>

            {/* admin 업로드 토글 */}
            {isAdmin && (
              <div className="space-y-2 px-4 pb-3">
                {showCategoryForm && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2">
                    <input
                      value={newCategoryLabel}
                      onChange={(e) => setNewCategoryLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddCategory();
                        }
                        if (e.key === "Escape") {
                          setNewCategoryLabel("");
                          setShowCategoryForm(false);
                        }
                      }}
                      placeholder="새 카테고리 이름"
                      maxLength={20}
                      className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-xs outline-none transition focus:border-dunggeure-primary"
                    />
                    <button
                      type="button"
                      onClick={handleAddCategory}
                      disabled={addingCategory || !newCategoryLabel.trim()}
                      className="rounded-lg bg-dunggeure-primary px-3 py-1.5 text-xs font-bold text-white transition hover:bg-dunggeure-dark disabled:opacity-50"
                    >
                      {addingCategory ? "추가 중..." : "추가"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewCategoryLabel("");
                        setShowCategoryForm(false);
                      }}
                      disabled={addingCategory}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs transition hover:bg-dunggeure-lighter/30 disabled:opacity-50"
                    >
                      취소
                    </button>
                  </div>
                )}
                {error && !showUploadForm && (
                  <div className="text-xs text-red-600">{error}</div>
                )}
                {!showUploadForm ? (
                  <button
                    onClick={openUploadForm}
                    className="text-xs px-3 py-1 rounded-lg border border-dunggeure-primary text-dunggeure-primary hover:bg-dunggeure-lighter/30 transition flex items-center gap-1"
                  >
                    <Plus size={12} />새 스티커 추가
                  </button>
                ) : (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <StickerCategorySelect
                        categories={categories}
                        value={uploadCategory}
                        onChange={setUploadCategory}
                      />
                      <input
                        value={uploadName}
                        onChange={(e) => setUploadName(e.target.value)}
                        placeholder="스티커 이름"
                        className="px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs outline-none focus:border-dunggeure-primary"
                      />
                    </div>

                    <div className="flex items-start gap-3">
                      {/* 파일 선택 + 미리보기 */}
                      <label
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-dunggeure-primary text-dunggeure-primary cursor-pointer hover:bg-dunggeure-lighter/30 transition ${
                          uploading ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                      >
                        {uploadFile ? "파일 변경" : "파일 선택"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          disabled={uploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFilePick(f);
                            e.target.value = "";
                          }}
                          className="hidden"
                        />
                      </label>
                      <span className="text-[10px] text-[var(--text-secondary)] mt-2">
                        최대 2MB
                      </span>
                    </div>

                    {/* 미리보기 (고정 높이로 흔들림 방지) */}
                    <div className="h-20 w-20 rounded border border-[var(--border)] bg-[var(--bg)] relative flex items-center justify-center overflow-hidden">
                      {uploadPreview ? (
                        <>
                          <img
                            src={uploadPreview}
                            alt="미리보기"
                            className="max-h-full max-w-full object-contain"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setUploadFile(null);
                              setUploadPreview(null);
                            }}
                            className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-500/90 text-white flex items-center justify-center hover:bg-red-600 transition shadow"
                            aria-label="파일 제거"
                          >
                            <X size={8} />
                          </button>
                        </>
                      ) : (
                        <span className="text-[10px] text-[var(--text-secondary)]">
                          미리보기
                        </span>
                      )}
                    </div>

                    {error && (
                      <div className="text-xs text-red-600">{error}</div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        onClick={resetUploadForm}
                        disabled={uploading}
                        className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] hover:bg-dunggeure-lighter/30 transition disabled:opacity-50"
                      >
                        취소
                      </button>
                      <button
                        onClick={handleUpload}
                        disabled={
                          uploading || !uploadFile || !uploadName.trim()
                        }
                        className="text-xs px-3 py-1.5 rounded-lg bg-dunggeure-primary text-white hover:bg-dunggeure-dark transition disabled:opacity-50"
                      >
                        {uploading ? "업로드 중..." : "추가"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 그리드 (스켈레톤/빈 상태/실제 그리드 사이 높이 점프 방지) */}
          <div className="min-h-[280px] flex-1 overflow-y-auto p-4">
            {loading ? (
              <div
                className="grid grid-cols-4 gap-3 sm:grid-cols-6"
                aria-busy="true"
                aria-label="스티커 로딩 중"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i}>
                    <div className="w-full aspect-square rounded-lg bg-[var(--bg-secondary)] animate-pulse" />
                    <div className="mt-1 h-2.5 w-3/4 mx-auto rounded bg-[var(--bg-secondary)] animate-pulse" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-sm text-[var(--text-secondary)]">
                등록된 스티커가 없습니다.
              </div>
            ) : (
              <DndContext
                sensors={stickerSensors}
                onDragStart={(event) => {
                  if (canReorderStickers) {
                    setDraggingStickerId(String(event.active.id));
                  }
                }}
                onDragEnd={handleStickerDragEnd}
                onDragCancel={() => setDraggingStickerId(null)}
              >
                <SortableContext
                  items={filtered.map((s) => s.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
                    {filtered.map((s) => (
                      <StickerGridItem
                        key={s.id}
                        sticker={s}
                        isAdmin={isAdmin}
                        draggable={canReorderStickers}
                        isDragging={draggingStickerId === s.id}
                        onPick={handlePickSticker}
                        onEdit={startStickerEdit}
                        onDelete={handleDelete}
                        onToggleFavorite={toggleStickerFavorite}
                      />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay dropAnimation={null}>
                  {activeSticker ? (
                    <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-dunggeure-primary bg-[var(--card)] shadow-xl">
                      <img
                        src={activeSticker.url}
                        alt={activeSticker.name}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </div>
      </div>
      <AppDialog
        open={!!editingSticker}
        title="스티커 수정"
        confirmText="저장"
        cancelText="취소"
        busy={editingStickerBusy}
        onConfirm={handleUpdateSticker}
        onClose={() => {
          if (!editingStickerBusy) resetStickerEdit();
        }}
      >
        <div className="space-y-3">
          {editingSticker && (
            <div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
              <img
                src={editingSticker.url}
                alt={editingSticker.name}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs text-[var(--text-secondary)]">
              스티커 이름
            </label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleUpdateSticker();
                }
              }}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none transition focus:border-dunggeure-primary"
              placeholder="스티커 이름"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-secondary)]">
              카테고리
            </label>
            <StickerCategorySelect
              categories={categories}
              value={editCategory}
              onChange={setEditCategory}
            />
          </div>
          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>
      </AppDialog>
      <AppDialog
        open={favoriteLimitDialogOpen}
        title="즐겨찾기 개수 초과"
        description={`즐겨찾기는 최대 ${FAVORITE_STICKER_LIMIT}개까지 설정할 수 있어요.\n다른 스티커의 즐겨찾기를 해제한 뒤 다시 추가해주세요.`}
        confirmText="확인"
        onClose={() => setFavoriteLimitDialogOpen(false)}
      />
      <AppDialog
        open={!!deleteStickerTarget}
        title="스티커 삭제"
        description={
          deleteStickerTarget
            ? `"${deleteStickerTarget.name}" 스티커를 삭제할까요?\n삭제한 스티커는 일정에 다시 선택할 수 없어요.`
            : undefined
        }
        confirmText="삭제"
        cancelText="취소"
        variant="danger"
        busy={deletingSticker}
        onConfirm={confirmDeleteSticker}
        onClose={() => {
          if (!deletingSticker) setDeleteStickerTarget(null);
        }}
      />
    </div>
  );
}

function StickerCategorySelect({
  categories,
  value,
  onChange,
}: {
  categories: StickerCategoryOption[];
  value: StickerCategory;
  onChange: (value: StickerCategory) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const selected = categories.find((category) => category.value === value);

  useEffect(() => {
    if (!open) return;

    const handleOutsidePointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (target instanceof Node && !wrapRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsidePointer);
    document.addEventListener("touchstart", handleOutsidePointer);
    return () => {
      document.removeEventListener("mousedown", handleOutsidePointer);
      document.removeEventListener("touchstart", handleOutsidePointer);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-left text-xs outline-none transition hover:border-dunggeure-light focus:border-dunggeure-primary"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selected?.label || "카테고리 선택"}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-[130] max-h-44 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 text-xs shadow-xl"
        >
          {categories.map((category) => {
            const selectedCategory = category.value === value;
            return (
              <button
                key={category.value}
                type="button"
                role="option"
                aria-selected={selectedCategory}
                onClick={() => {
                  onChange(category.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition ${
                  selectedCategory
                    ? "bg-dunggeure-primary text-white"
                    : "hover:bg-dunggeure-lighter/35"
                }`}
              >
                <span className="truncate">{category.label}</span>
                {selectedCategory && <Check size={12} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StickerGridItem({
  sticker,
  isAdmin,
  draggable,
  isDragging,
  onPick,
  onEdit,
  onDelete,
  onToggleFavorite,
}: {
  sticker: Sticker;
  isAdmin: boolean;
  draggable: boolean;
  isDragging: boolean;
  onPick: (sticker: Sticker) => void;
  onEdit: (sticker: Sticker) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (sticker: Sticker) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: sticker.id,
      disabled: !draggable,
    });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
      }}
      className="group relative"
    >
      <button
        type="button"
        onClick={() => onPick(sticker)}
        className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] transition hover:border-dunggeure-primary"
        title={sticker.name}
      >
        <img
          src={sticker.url}
          alt={sticker.name}
          className="max-h-full max-w-full object-contain"
        />
      </button>
      {isAdmin && (
        <>
          {draggable && (
            <button
              type="button"
              {...attributes}
              {...listeners}
              className="absolute left-0.5 top-0.5 flex h-5 w-5 cursor-grab items-center justify-center rounded-full bg-black/55 text-white opacity-0 shadow transition hover:bg-black/70 active:cursor-grabbing group-hover:opacity-100"
              aria-label="스티커 순서 변경"
            >
              <GripVertical size={11} />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(sticker);
            }}
            className={`absolute top-0.5 flex h-5 w-5 items-center justify-center rounded-full text-white shadow transition group-hover:opacity-100 ${
              sticker.is_favorite
                ? "bg-yellow-400 opacity-100 hover:bg-yellow-500"
                : "bg-black/55 opacity-0 hover:bg-black/70"
            } ${draggable ? "left-6" : "left-0.5"}`}
            aria-label={sticker.is_favorite ? "즐겨찾기 해제" : "즐겨찾기"}
            title={sticker.is_favorite ? "즐겨찾기 해제" : "즐겨찾기"}
          >
            <Star
              size={10}
              fill={sticker.is_favorite ? "currentColor" : "none"}
            />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(sticker);
            }}
            className={`absolute top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-dunggeure-primary/90 text-white opacity-0 shadow transition hover:bg-dunggeure-dark group-hover:opacity-100 ${
              draggable ? "left-[3.125rem]" : "left-6"
            }`}
            aria-label="스티커 수정"
          >
            <Edit2 size={10} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(sticker.id);
            }}
            className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500/90 text-white opacity-0 shadow transition group-hover:opacity-100"
            aria-label="스티커 삭제"
          >
            <X size={10} />
          </button>
        </>
      )}
      {!isAdmin && sticker.is_favorite && (
        <span
          className="absolute left-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-yellow-400 text-white shadow"
          aria-label="즐겨찾기"
          title="즐겨찾기"
        >
          <Star size={10} fill="currentColor" />
        </span>
      )}
      <div className="mt-1 truncate text-center text-[10px] text-[var(--text-secondary)]">
        {sticker.name}
      </div>
    </div>
  );
}

// ===== 캘린더 데코 관리 모달 =====
function DecorationManager({
  year,
  month,
  calDays,
  decorations,
  onClose,
  onChanged,
}: {
  year: number;
  month: number;
  calDays: Date[];
  decorations: CalendarDecoration[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [rangeStartDate, setRangeStartDate] = useState<string | null>(null);
  const [selectedSpan, setSelectedSpan] = useState(1);
  const [caption, setCaption] = useState("");
  const [captionRichSegments, setCaptionRichSegments] = useState<
    ScheduleRichTextSegment[]
  >([]);
  const [captionFontWeight, setCaptionFontWeight] = useState<"normal" | "bold">(
    "bold",
  );
  const [captionIsItalic, setCaptionIsItalic] = useState(false);
  const [captionIsUnderline, setCaptionIsUnderline] = useState(false);
  const [captionIsStrikethrough, setCaptionIsStrikethrough] = useState(false);
  const [captionFontSize, setCaptionFontSize] = useState(16);
  const [captionFontSizePicker, setCaptionFontSizePicker] = useState("16");
  const [captionTextAlign, setCaptionTextAlign] = useState<
    "left" | "center" | "right"
  >("center");
  const [captionBgColor, setCaptionBgColor] = useState("#f0f0ff");
  const [captionBgAlpha, setCaptionBgAlpha] = useState(0.85);
  const [captionBgPickerColor, setCaptionBgPickerColor] = useState("#f0f0ff");
  const [captionBgPickerAlpha, setCaptionBgPickerAlpha] = useState(0.85);
  const [captionFontColor, setCaptionFontColor] = useState("#9a94d0");
  const [captionFontAlpha, setCaptionFontAlpha] = useState(1);
  const [captionFontPickerColor, setCaptionFontPickerColor] =
    useState("#9a94d0");
  const [captionFontPickerAlpha, setCaptionFontPickerAlpha] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleteTargetDeco, setDeleteTargetDeco] =
    useState<CalendarDecoration | null>(null);
  const captionTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const formatCellDate = (date: Date) => format(date, "yyyy-MM-dd");

  const decorationByDate = useMemo(() => {
    const map = new Map<string, CalendarDecoration>();
    for (const d of decorations) map.set(d.cell_date, d);
    return map;
  }, [decorations]);

  const decorationCoveredDates = useMemo(() => {
    const set = new Set<string>();
    for (const deco of decorations) {
      const span = Math.max(1, Math.min(7, deco.span || 1));
      const start = new Date(`${deco.cell_date}T00:00:00`);
      for (let i = 1; i < span; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        set.add(formatCellDate(date));
      }
    }
    return set;
  }, [decorations]);

  const selectedRangeDates = useMemo(() => {
    if (!selectedDate) return new Set<string>();
    const set = new Set<string>();
    const start = new Date(`${selectedDate}T00:00:00`);
    for (let i = 0; i < selectedSpan; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      set.add(formatCellDate(date));
    }
    return set;
  }, [selectedDate, selectedSpan]);

  const loadDecorationTextState = (deco: CalendarDecoration | null) => {
    const style = deco
      ? getDecorationCaptionStyle(deco)
      : DEFAULT_DECORATION_TEXT_STYLE;
    const bg = parseColor(
      style.bg_color || DEFAULT_DECORATION_TEXT_STYLE.bg_color || "#f0f0ff",
    );
    const fg = parseColor(
      style.font_color || DEFAULT_DECORATION_TEXT_STYLE.font_color || "#612DD4",
    );
    const fontSize =
      typeof style.font_size === "number" && Number.isFinite(style.font_size)
        ? Math.max(8, Math.min(28, style.font_size))
        : 16;
    setCaption(deco?.caption ?? "");
    setCaptionRichSegments([]);
    setCaptionFontWeight(style.font_weight || "bold");
    setCaptionIsItalic(Boolean(style.is_italic));
    setCaptionIsUnderline(Boolean(style.is_underline));
    setCaptionIsStrikethrough(Boolean(style.is_strikethrough));
    setCaptionFontSize(fontSize);
    setCaptionFontSizePicker(String(fontSize));
    setCaptionTextAlign(
      style.text_align === "left" ||
        style.text_align === "right" ||
        style.text_align === "center"
        ? style.text_align
        : "center",
    );
    setCaptionBgColor(bg.hex);
    setCaptionBgAlpha(bg.alpha);
    setCaptionBgPickerColor(bg.hex);
    setCaptionBgPickerAlpha(bg.alpha);
    setCaptionFontColor(fg.hex);
    setCaptionFontAlpha(fg.alpha);
    setCaptionFontPickerColor(fg.hex);
    setCaptionFontPickerAlpha(fg.alpha);
  };

  const handleCellSelect = (dateStr: string) => {
    setError("");
    const existingDeco = decorationByDate.get(dateStr);
    if (existingDeco) {
      setSelectedDate(dateStr);
      setSelectedSpan(Math.max(1, Math.min(7, existingDeco.span || 1)));
      loadDecorationTextState(existingDeco);
      setRangeStartDate(null);
      return;
    }

    if (!rangeStartDate) {
      setSelectedDate(dateStr);
      setSelectedSpan(1);
      loadDecorationTextState(null);
      setRangeStartDate(dateStr);
      return;
    }

    const startIndex = calDays.findIndex(
      (date) => formatCellDate(date) === rangeStartDate,
    );
    const endIndex = calDays.findIndex(
      (date) => formatCellDate(date) === dateStr,
    );
    const sameRow =
      startIndex >= 0 &&
      endIndex >= startIndex &&
      Math.floor(startIndex / 7) === Math.floor(endIndex / 7);

    if (!sameRow) {
      setSelectedDate(dateStr);
      setSelectedSpan(1);
      loadDecorationTextState(null);
      setRangeStartDate(dateStr);
      setError("같은 주 안에서 시작 셀보다 오른쪽 셀을 선택해주세요.");
      return;
    }

    setSelectedDate(rangeStartDate);
    setSelectedSpan(endIndex - startIndex + 1);
    loadDecorationTextState(null);
    setRangeStartDate(null);
  };

  const getCaptionStylePayload = (): ScheduleContentStyle => ({
    font_weight: captionFontWeight,
    is_italic: captionIsItalic,
    is_underline: captionIsUnderline,
    is_strikethrough: captionIsStrikethrough,
    font_size: captionFontSize,
    font_color: combineColor(captionFontColor, captionFontAlpha),
    bg_color: combineColor(captionBgColor, captionBgAlpha),
    text_align: captionTextAlign,
  });

  const getCaptionRichPayload = () => null;

  const applyCaptionFontSize = (nextFontSize: number) => {
    const clamped = Math.max(8, Math.min(28, Math.round(nextFontSize)));
    setCaptionFontSize(clamped);
    setCaptionFontSizePicker(String(clamped));
  };

  const commitCaptionFontSizeInput = () => {
    const parsed = Number(captionFontSizePicker);
    applyCaptionFontSize(Number.isFinite(parsed) ? parsed : captionFontSize);
  };

  const handleUpload = async (file: File) => {
    if (!selectedDate) {
      setError("셀을 선택하세요.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("owner_year", String(year));
      fd.append("owner_month", String(month));
      fd.append("cell_date", selectedDate);
      fd.append("span", String(selectedSpan));
      fd.append("caption", caption);
      fd.append("caption_rich", JSON.stringify(getCaptionRichPayload()));
      fd.append("caption_style", JSON.stringify(getCaptionStylePayload()));
      const res = await fetch("/api/decorations", {
        method: "POST",
        body: fd,
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "업로드 실패");
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleSaveTextDecoration = async () => {
    if (!selectedDate || busy) return;
    if (!caption.trim()) {
      setError("문구를 입력하세요.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("owner_year", String(year));
      fd.append("owner_month", String(month));
      fd.append("cell_date", selectedDate);
      fd.append("span", String(selectedSpan));
      fd.append("caption", caption);
      fd.append("caption_rich", JSON.stringify(getCaptionRichPayload()));
      fd.append("caption_style", JSON.stringify(getCaptionStylePayload()));
      const res = await fetch("/api/decorations", {
        method: "POST",
        body: fd,
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "문구 데코 저장 실패");
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCaption = async () => {
    if (!selectedDeco || busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/decorations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedDeco.id,
          caption,
          caption_rich: getCaptionRichPayload(),
          caption_style: getCaptionStylePayload(),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "문구 저장 실패");
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteCaption = async () => {
    if (!selectedDeco || busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/decorations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedDeco.id,
          caption: "",
          caption_rich: null,
          caption_style: null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "문구 삭제 실패");
        return;
      }
      setCaption("");
      setCaptionRichSegments([]);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = (deco: CalendarDecoration) => {
    if (busy) return;
    setDeleteTargetDeco(deco);
  };

  const confirmDeleteDecoration = async () => {
    if (!deleteTargetDeco || busy) return;
    const id = deleteTargetDeco.id;
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/decorations?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "데코 삭제 실패");
        return;
      }
      setDeleteTargetDeco(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const selectedDeco = selectedDate ? decorationByDate.get(selectedDate) : null;
  const captionChanged =
    !!selectedDeco &&
    (caption.trim() !== (selectedDeco.caption ?? "") ||
      JSON.stringify(getCaptionRichPayload()) !==
        JSON.stringify(selectedDeco.caption_rich ?? null) ||
      JSON.stringify(getCaptionStylePayload()) !==
        JSON.stringify(selectedDeco.caption_style ?? null));
  const captionBoldPressed = captionFontWeight === "bold";
  const captionItalicPressed = captionIsItalic;
  const captionUnderlinePressed = captionIsUnderline;
  const captionStrikethroughPressed = captionIsStrikethrough;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-black/40 p-3 backdrop-blur-sm sm:p-4"
        onClick={onClose}
      >
        <div
          className="flex max-h-[calc(100dvh-1.5rem)] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-[var(--card)] font-hakgyoansimnadeuri shadow-2xl sm:max-h-[85vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] p-4">
            <h3 className="font-bold text-dunggeure-dark">
              데코 관리 — {year}년 {month}월
            </h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1 transition hover:bg-dunggeure-lighter/30"
              aria-label="닫기"
            >
              <X size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {/* 안내 */}
            <p className="text-xs text-[var(--text-secondary)]">
              시작 셀을 선택한 뒤 같은 주의 끝 셀을 한 번 더 선택하면 여러 셀을
              하나의 데코 이미지로 합칠 수 있습니다.
              <br />
              기존 데코와 겹치는 범위는 저장되지 않습니다. (이 달 캘린더
              화면에서만 적용 — 일정 데이터는 그대로 유지)
            </p>

            {/* 셀 그리드 (작은 캘린더) */}
            <div className="grid grid-cols-7 gap-1">
              {DAY_HEADERS.map((d, i) => (
                <div
                  key={d}
                  className="text-center text-[10px] font-bold"
                  style={{ color: DAY_HEADER_COLORS[i] }}
                >
                  {d}
                </div>
              ))}
              {calDays.map((day) => {
                const dateStr = formatCellDate(day);
                if (decorationCoveredDates.has(dateStr)) return null;
                const inMonth = day.getMonth() + 1 === month;
                const deco = decorationByDate.get(dateStr);
                const decoSpan = deco
                  ? Math.max(1, Math.min(7, deco.span || 1))
                  : 1;
                const sel = selectedRangeDates.has(dateStr);
                const rangeStart = rangeStartDate === dateStr;
                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => handleCellSelect(dateStr)}
                    className={`aspect-square rounded border text-[11px] font-medium transition flex flex-col items-center justify-center overflow-hidden relative ${
                      sel
                        ? "border-dunggeure-primary ring-2 ring-dunggeure-primary/40"
                        : "border-[var(--border)] hover:border-dunggeure-light"
                    } ${rangeStart ? "bg-dunggeure-lighter/40" : ""} ${inMonth ? "text-[var(--text)]" : "text-[var(--text-secondary)] opacity-60"}`}
                    style={{
                      gridColumn:
                        decoSpan > 1
                          ? `span ${decoSpan} / span ${decoSpan}`
                          : undefined,
                      aspectRatio: decoSpan > 1 ? `${decoSpan} / 1` : undefined,
                      ...(deco?.image_url
                        ? {
                            backgroundImage: `url(${deco.image_url})`,
                            backgroundSize: "contain",
                            backgroundPosition: "center",
                            backgroundRepeat: "no-repeat",
                          }
                        : undefined),
                      ...(deco && !deco.image_url && deco.caption
                        ? buildScheduleContentStyle(
                            getDecorationCaptionStyle(deco),
                          )
                        : undefined),
                    }}
                  >
                    <span
                      className={
                        deco
                          ? "absolute top-0.5 left-1 text-[10px] font-bold text-white drop-shadow"
                          : ""
                      }
                    >
                      {format(day, "d")}
                    </span>
                    {deco && !deco.image_url && deco.caption && (
                      <span className="line-clamp-2 px-1 text-center text-[10px] leading-tight">
                        <RichTextContent
                          segments={getDecorationCaptionRichSegments(deco)}
                          fallback={deco.caption}
                        />
                      </span>
                    )}
                    {decoSpan > 1 && (
                      <span className="absolute bottom-0.5 right-1 rounded bg-black/45 px-1 text-[9px] font-bold text-white">
                        {decoSpan}칸
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-2 text-xs text-red-600">
                {error}
              </div>
            )}

            {/* 선택된 셀 정보 + 액션 */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 space-y-3">
              <div className="text-sm font-medium">
                선택한 범위:{" "}
                {selectedDate ? (
                  <span className="text-dunggeure-primary">
                    {selectedDate}
                    {selectedSpan > 1 ? `부터 ${selectedSpan}칸` : ""}
                  </span>
                ) : (
                  <span className="text-[var(--text-secondary)]">없음</span>
                )}
              </div>
              {rangeStartDate && (
                <p className="text-xs text-dunggeure-primary">
                  시작 셀을 선택했습니다. 같은 주에서 끝 셀을 선택하면 범위가
                  확정됩니다. 같은 셀을 한 번 더 선택하면 1칸 데코가 됩니다.
                </p>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text-secondary)]">
                  데코 문구
                </label>
                <textarea
                  ref={captionTextareaRef}
                  value={caption}
                  onChange={(event) => {
                    setCaption(event.target.value);
                    setCaptionRichSegments([]);
                  }}
                  maxLength={80}
                  rows={2}
                  disabled={!selectedDate || !!rangeStartDate || busy}
                  placeholder="예: 그림: 둥그레님 / 서버 오픈런 이미지"
                  className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none transition focus:border-dunggeure-primary disabled:opacity-50"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-dunggeure-lighter/40 px-2 py-1 text-[11px] font-bold text-dunggeure-dark">
                    전체 문구
                  </span>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() =>
                      setCaptionFontWeight((value) =>
                        value === "bold" ? "normal" : "bold",
                      )
                    }
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-bold transition ${
                      captionBoldPressed
                        ? "border-dunggeure-primary bg-dunggeure-primary text-white"
                        : "border-[var(--border)] bg-[var(--bg)] hover:border-dunggeure-light"
                    }`}
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setCaptionIsItalic((value) => !value)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm italic transition ${
                      captionItalicPressed
                        ? "border-dunggeure-primary bg-dunggeure-primary text-white"
                        : "border-[var(--border)] bg-[var(--bg)] hover:border-dunggeure-light"
                    }`}
                  >
                    I
                  </button>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setCaptionIsUnderline((value) => !value)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm underline transition ${
                      captionUnderlinePressed
                        ? "border-dunggeure-primary bg-dunggeure-primary text-white"
                        : "border-[var(--border)] bg-[var(--bg)] hover:border-dunggeure-light"
                    }`}
                  >
                    U
                  </button>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setCaptionIsStrikethrough((value) => !value)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm line-through transition ${
                      captionStrikethroughPressed
                        ? "border-dunggeure-primary bg-dunggeure-primary text-white"
                        : "border-[var(--border)] bg-[var(--bg)] hover:border-dunggeure-light"
                    }`}
                  >
                    S
                  </button>
                  <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                    크기
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyCaptionFontSize(captionFontSize - 1)}
                      disabled={captionFontSize <= 8}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg)] transition hover:border-dunggeure-light disabled:opacity-40"
                      aria-label="문구 폰트 크기 줄이기"
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={captionFontSizePicker}
                      onChange={(event) => {
                        const nextValue = event.target.value
                          .replace(/[^0-9]/g, "")
                          .slice(0, 2);
                        setCaptionFontSizePicker(nextValue);
                        const parsed = Number(nextValue);
                        if (
                          Number.isFinite(parsed) &&
                          parsed >= 8 &&
                          parsed <= 28
                        ) {
                          setCaptionFontSize(parsed);
                        }
                      }}
                      onBlur={commitCaptionFontSizeInput}
                      className="h-8 w-14 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-center text-sm outline-none transition focus:border-dunggeure-primary"
                    />
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyCaptionFontSize(captionFontSize + 1)}
                      disabled={captionFontSize >= 28}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg)] transition hover:border-dunggeure-light disabled:opacity-40"
                      aria-label="문구 폰트 크기 키우기"
                    >
                      <Plus size={14} />
                    </button>
                  </label>
                  <div className="flex items-center gap-1">
                    {(
                      [
                        { value: "left", label: "왼쪽 정렬", icon: AlignLeft },
                        {
                          value: "center",
                          label: "가운데 정렬",
                          icon: AlignCenter,
                        },
                        {
                          value: "right",
                          label: "오른쪽 정렬",
                          icon: AlignRight,
                        },
                      ] as const
                    ).map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => setCaptionTextAlign(value)}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                          captionTextAlign === value
                            ? "border-dunggeure-primary bg-dunggeure-primary text-white"
                            : "border-[var(--border)] bg-[var(--bg)] hover:border-dunggeure-light"
                        }`}
                        aria-label={label}
                      >
                        <Icon size={15} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <ColorField
                    label="문구 배경색"
                    hex={captionBgPickerColor}
                    alpha={captionBgPickerAlpha}
                    onChange={(hex, alpha) => {
                      setCaptionBgPickerColor(hex);
                      setCaptionBgPickerAlpha(alpha);
                      setCaptionBgColor(hex);
                      setCaptionBgAlpha(alpha);
                    }}
                    onReset={() => {
                      setCaptionBgPickerColor("#f0f0ff");
                      setCaptionBgPickerAlpha(0.85);
                      setCaptionBgColor("#f0f0ff");
                      setCaptionBgAlpha(0.85);
                    }}
                  />
                  <ColorField
                    label="문구 폰트색"
                    hex={captionFontPickerColor}
                    alpha={captionFontPickerAlpha}
                    onChange={(hex, alpha) => {
                      setCaptionFontPickerColor(hex);
                      setCaptionFontPickerAlpha(alpha);
                      setCaptionFontColor(hex);
                      setCaptionFontAlpha(alpha);
                    }}
                    onReset={() => {
                      setCaptionFontPickerColor("#9a94d0");
                      setCaptionFontPickerAlpha(1);
                      setCaptionFontColor("#9a94d0");
                      setCaptionFontAlpha(1);
                    }}
                  />
                </div>
                <div
                  className="rounded-lg px-3 py-2 text-sm"
                  style={buildScheduleContentStyle(getCaptionStylePayload())}
                >
                  <RichTextContent
                    segments={captionRichSegments}
                    fallback={caption.trim() || "문구 미리보기"}
                  />
                </div>
                <div className="text-right text-[11px] text-[var(--text-secondary)]">
                  {caption.length} / 80
                </div>
              </div>

              {selectedDeco && (
                <div className="flex items-start gap-3">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--border)] bg-white">
                    {selectedDeco.image_url ? (
                      <LoadingImage
                        src={selectedDeco.image_url}
                        alt=""
                        wrapperClassName="h-full w-full items-center justify-center rounded"
                        skeletonClassName="rounded"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="px-1 text-center text-[10px] text-dunggeure-dark">
                        문구 데코
                      </span>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <p className="text-xs text-[var(--text-secondary)]">
                      이 범위에 이미 데코가 있습니다. 이미지를 업로드하면
                      {Math.max(1, selectedDeco.span || 1)}칸 데코의 이미지가
                      교체됩니다.
                    </p>
                    {selectedDeco.caption && (
                      <p
                        className="rounded-lg px-2 py-1 text-xs text-dunggeure-dark"
                        style={buildScheduleContentStyle(
                          getDecorationCaptionStyle(selectedDeco),
                        )}
                      >
                        <RichTextContent
                          segments={getDecorationCaptionRichSegments(
                            selectedDeco,
                          )}
                          fallback={selectedDeco.caption}
                        />
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {selectedDeco.caption && selectedDeco.image_url && (
                        <button
                          type="button"
                          onClick={handleDeleteCaption}
                          disabled={busy}
                          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-dunggeure-lighter/30 disabled:opacity-50"
                        >
                          문구만 삭제
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(selectedDeco)}
                        disabled={busy}
                        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        데코 삭제
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <label
                  className={`inline-flex items-center gap-1 rounded-lg border border-dunggeure-primary px-3 py-1.5 text-xs font-medium text-dunggeure-primary transition hover:bg-dunggeure-lighter/30 ${
                    busy || !selectedDate || !!rangeStartDate
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer"
                  }`}
                >
                  <Plus size={12} />
                  {selectedDeco ? "이미지 교체" : "이미지 업로드"} (최대 5MB)
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    disabled={busy || !selectedDate || !!rangeStartDate}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(f);
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={
                    selectedDeco ? handleSaveCaption : handleSaveTextDecoration
                  }
                  disabled={
                    busy ||
                    !selectedDate ||
                    !!rangeStartDate ||
                    !caption.trim() ||
                    (selectedDeco ? !captionChanged : false)
                  }
                  className="inline-flex items-center gap-1 rounded-lg bg-dunggeure-primary px-3 py-1.5 text-xs font-bold text-white transition hover:bg-dunggeure-dark disabled:opacity-50"
                >
                  {selectedDeco ? "문구 저장" : "문구 데코 추가"}
                </button>
                {busy && (
                  <span className="text-xs text-[var(--text-secondary)]">
                    처리 중...
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <AppDialog
        open={Boolean(deleteTargetDeco)}
        title="데코 삭제"
        description={
          deleteTargetDeco
            ? "이 데코를 삭제할까요? 삭제한 데코는 되돌릴 수 없습니다."
            : ""
        }
        confirmText="삭제"
        cancelText="취소"
        variant="danger"
        busy={busy}
        onConfirm={confirmDeleteDecoration}
        onClose={() => {
          if (!busy) setDeleteTargetDeco(null);
        }}
      />
    </>
  );
}

const NOTICE_MAX_LENGTH = 500;
const NOTICE_MAX_VISIBLE_LINES = 3;
const NOTICE_TEMPLATE_TITLE_MAX_LENGTH = 30;

const DEFAULT_NOTICE_TEMPLATES: NoticeTemplate[] = [
  {
    id: "default-notice",
    title: "기본 공지",
    content:
      "• 일정은 상황에 따라 변경될 수 있어용\n• 일일 방송 공지가 가장 정확합니닷",
    sort_order: 0,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  },
];

function getNoticeLineCount(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\r?\n/).length;
}

function appendNoticeTemplateContent(current: string, templateContent: string) {
  return current.trim()
    ? `${current.trimEnd()}\n${templateContent}`
    : templateContent;
}

// ===== 월별 공지 편집 모달 =====
function NoticeEditor({
  year,
  month,
  notice,
  onClose,
  onSaved,
}: {
  year: number;
  month: number;
  notice: MonthlyNotice | null;
  onClose: () => void;
  onSaved: (next: MonthlyNotice | null) => void;
}) {
  const [content, setContent] = useState(notice?.content ?? "");
  const [imageUrl, setImageUrl] = useState(notice?.image_url ?? null);
  const [imageStoragePath, setImageStoragePath] = useState(
    notice?.image_storage_path ?? null,
  );
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [noticeTemplates, setNoticeTemplates] = useState<NoticeTemplate[]>(
    DEFAULT_NOTICE_TEMPLATES,
  );
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateError, setTemplateError] = useState("");
  const [templateTitle, setTemplateTitle] = useState("");
  const [templateContent, setTemplateContent] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null,
  );
  const [deleteTargetTemplate, setDeleteTargetTemplate] =
    useState<NoticeTemplate | null>(null);
  const [appliedTemplate, setAppliedTemplate] = useState<{
    id: string;
    previousContent: string;
  } | null>(null);

  const loadNoticeTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await fetch("/api/notice-templates");
      const d = await res.json();
      if (!res.ok) {
        setTemplateError(d.error || "템플릿을 불러오지 못했습니다.");
        return;
      }
      setNoticeTemplates(
        Array.isArray(d.templates) && d.templates.length
          ? d.templates
          : DEFAULT_NOTICE_TEMPLATES,
      );
    } catch {
      setTemplateError("템플릿을 불러오지 못했습니다.");
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNoticeTemplates();
  }, [loadNoticeTemplates]);

  const handleImageUpload = async (file: File) => {
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "이미지 업로드 실패");
        return;
      }
      setImageUrl(d.url);
      setImageStoragePath(d.path);
    } finally {
      setUploading(false);
    }
  };

  const resetTemplateForm = () => {
    setEditingTemplateId(null);
    setTemplateTitle("");
    setTemplateContent("");
    setTemplateError("");
  };

  const startTemplateEdit = (template: NoticeTemplate) => {
    setEditingTemplateId(template.id);
    setTemplateTitle(template.title);
    setTemplateContent(template.content);
    setTemplateError("");
  };

  const saveNoticeTemplate = async () => {
    if (templateBusy) return;
    const title = templateTitle.trim();
    const body = templateContent.trim();

    if (!title) {
      setTemplateError("템플릿 이름을 입력하세요.");
      return;
    }
    if (title.length > NOTICE_TEMPLATE_TITLE_MAX_LENGTH) {
      setTemplateError(
        `템플릿 이름은 ${NOTICE_TEMPLATE_TITLE_MAX_LENGTH}자 이하로 입력하세요.`,
      );
      return;
    }
    if (!body) {
      setTemplateError("템플릿 내용을 입력하세요.");
      return;
    }
    if (body.length > NOTICE_MAX_LENGTH) {
      setTemplateError(
        `템플릿 내용은 ${NOTICE_MAX_LENGTH}자를 넘을 수 없습니다.`,
      );
      return;
    }

    setTemplateBusy(true);
    setTemplateError("");
    try {
      const res = await fetch("/api/notice-templates", {
        method: editingTemplateId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingTemplateId,
          title,
          content: body,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setTemplateError(d.error || "템플릿 저장 실패");
        return;
      }
      const nextTemplate = d.template as NoticeTemplate;
      setNoticeTemplates((prev) =>
        editingTemplateId
          ? prev.map((item) =>
              item.id === nextTemplate.id ? nextTemplate : item,
            )
          : [...prev, nextTemplate],
      );
      resetTemplateForm();
    } catch {
      setTemplateError("템플릿 저장 실패");
    } finally {
      setTemplateBusy(false);
    }
  };

  const confirmDeleteNoticeTemplate = async () => {
    if (!deleteTargetTemplate || templateBusy) return;
    const template = deleteTargetTemplate;

    setTemplateBusy(true);
    setTemplateError("");
    try {
      const res = await fetch(
        `/api/notice-templates?id=${encodeURIComponent(template.id)}`,
        { method: "DELETE" },
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTemplateError(d.error || "템플릿 삭제 실패");
        return;
      }
      setNoticeTemplates((prev) =>
        prev.filter((item) => item.id !== template.id),
      );
      if (editingTemplateId === template.id) resetTemplateForm();
      if (appliedTemplate?.id === template.id) setAppliedTemplate(null);
      setDeleteTargetTemplate(null);
    } catch {
      setTemplateError("템플릿 삭제 실패");
    } finally {
      setTemplateBusy(false);
    }
  };

  const applyNoticeTemplate = (template: NoticeTemplate) => {
    if (appliedTemplate?.id === template.id) {
      setContent(appliedTemplate.previousContent);
      setAppliedTemplate(null);
      setError("");
      return;
    }

    const nextContent = template.content;

    if (nextContent.length > NOTICE_MAX_LENGTH) {
      setError(`공지는 ${NOTICE_MAX_LENGTH}자를 넘을 수 없습니다.`);
      return;
    }

    setAppliedTemplate({ id: template.id, previousContent: content });
    setContent(nextContent);
    setError("");
  };

  const appendNoticeTemplate = (template: NoticeTemplate) => {
    const nextContent = appendNoticeTemplateContent(content, template.content);
    if (nextContent.length > NOTICE_MAX_LENGTH) {
      setError(`공지는 ${NOTICE_MAX_LENGTH}자를 넘을 수 없습니다.`);
      return;
    }
    if (getNoticeLineCount(nextContent) > NOTICE_MAX_VISIBLE_LINES) {
      setError(
        `공지는 ${NOTICE_MAX_VISIBLE_LINES}줄까지 표시되므로 이 템플릿은 추가할 수 없습니다.`,
      );
      return;
    }
    setContent(nextContent);
    setAppliedTemplate(null);
    setError("");
  };

  const handleSave = async () => {
    if (busy || uploading) return;
    if (content.length > NOTICE_MAX_LENGTH) {
      setError(`공지는 ${NOTICE_MAX_LENGTH}자를 넘을 수 없습니다.`);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/notices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_year: year,
          owner_month: month,
          content,
          image_url: imageUrl,
          image_storage_path: imageStoragePath,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "저장 실패");
        return;
      }
      onSaved(d.notice ?? null);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (busy || uploading) return;
    if (!confirm("이 달의 공지를 삭제하시겠습니까?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/notices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_year: year,
          owner_month: month,
          content: "",
          image_url: null,
          image_storage_path: null,
        }),
      });
      if (res.ok) onSaved(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <div
          className="flex max-h-[calc(100dvh-1rem)] min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-[var(--card)] shadow-2xl font-hakgyoansimnadeuri"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] p-4">
            <h3 className="font-bold text-dunggeure-dark">
              공지 — {year}년 {month}월
            </h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1 transition hover:bg-dunggeure-lighter/30"
              aria-label="닫기"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto overflow-x-hidden p-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-3">
              <p className="text-xs text-[var(--text-secondary)]">
                캘린더 위에 표시됩니다. 3줄 정도가 보기 좋습니다.
              </p>
              <textarea
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setAppliedTemplate(null);
                  if (error) setError("");
                }}
                placeholder="이 달의 공지를 입력하세요"
                rows={6}
                maxLength={NOTICE_MAX_LENGTH}
                className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none transition focus:border-dunggeure-primary"
              />
              <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                <span>
                  {content.length} / {NOTICE_MAX_LENGTH}
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-[var(--text-secondary)]">
                  공지 이미지 (선택, 최대 5MB · jpeg/png/webp/gif)
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dunggeure-primary px-3 py-1.5 text-xs font-medium text-dunggeure-primary transition hover:bg-dunggeure-lighter/30 ${
                      uploading ? "cursor-not-allowed opacity-50" : ""
                    }`}
                  >
                    <Plus size={12} />
                    {imageUrl ? "이미지 변경" : "이미지 선택"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      disabled={uploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file);
                        e.target.value = "";
                      }}
                      className="hidden"
                    />
                  </label>
                  {uploading && (
                    <span className="text-xs text-[var(--text-secondary)]">
                      업로드 중...
                    </span>
                  )}
                </div>
                <div className="relative flex h-20 w-full items-center justify-end overflow-hidden rounded-lg border border-[var(--border)] bg-dunggeure-lighter/20 px-4 py-2 pr-20">
                  <span className="mr-auto line-clamp-3 whitespace-pre-line text-xs text-dunggeure-dark">
                    {content.trim() || "공지 미리보기"}
                  </span>
                  <img
                    src={imageUrl || "/nav_dung.png"}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-[-0.85rem] right-2 h-20 w-auto opacity-45"
                  />
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setImageUrl(null);
                        setImageStoragePath(null);
                      }}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500/90 text-white shadow transition hover:bg-red-600"
                      aria-label="공지 이미지 제거"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 p-2 text-xs text-red-600">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-1">
                {notice ? (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={busy || uploading}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    공지 삭제
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={busy || uploading}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs transition hover:bg-dunggeure-lighter/30 disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={busy || uploading}
                    className="rounded-lg bg-dunggeure-primary px-3 py-1.5 text-xs text-white transition hover:bg-dunggeure-dark disabled:opacity-50"
                  >
                    {busy ? "저장 중..." : "저장"}
                  </button>
                </div>
              </div>
            </div>

            <aside className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3 lg:sticky lg:top-0 lg:self-start">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-dunggeure-dark">
                  공지 템플릿
                </h4>
                {templatesLoading && (
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    불러오는 중...
                  </span>
                )}
              </div>

              <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5">
                <input
                  type="text"
                  value={templateTitle}
                  maxLength={NOTICE_TEMPLATE_TITLE_MAX_LENGTH}
                  onChange={(event) => {
                    setTemplateTitle(event.target.value);
                    if (templateError) setTemplateError("");
                  }}
                  placeholder="템플릿 이름"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-xs outline-none transition focus:border-dunggeure-primary"
                />
                <textarea
                  value={templateContent}
                  maxLength={NOTICE_MAX_LENGTH}
                  onChange={(event) => {
                    setTemplateContent(event.target.value);
                    if (templateError) setTemplateError("");
                  }}
                  placeholder="템플릿 내용을 입력하세요"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-xs outline-none transition focus:border-dunggeure-primary"
                />
                <div className="grid min-h-8 grid-cols-[auto_1fr] items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                  <span>
                    {templateContent.length} / {NOTICE_MAX_LENGTH}
                  </span>
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={resetTemplateForm}
                      disabled={templateBusy || !editingTemplateId}
                      aria-hidden={!editingTemplateId}
                      tabIndex={editingTemplateId ? 0 : -1}
                      className={`rounded-md border border-[var(--border)] px-2 py-1 transition hover:bg-dunggeure-lighter/30 disabled:opacity-50 ${
                        editingTemplateId ? "" : "pointer-events-none invisible"
                      }`}
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={saveNoticeTemplate}
                      disabled={templateBusy}
                      className="rounded-md bg-dunggeure-primary px-2 py-1 font-medium text-white transition hover:bg-dunggeure-dark disabled:opacity-50"
                    >
                      {templateBusy
                        ? "처리 중..."
                        : editingTemplateId
                          ? "수정 저장"
                          : "템플릿 추가"}
                    </button>
                  </div>
                </div>
                {templateError && (
                  <div className="rounded-md bg-red-50 p-1.5 text-[11px] text-red-600">
                    {templateError}
                  </div>
                )}
              </div>

              <div className="max-h-[19rem] space-y-2 overflow-y-auto pr-1">
                {noticeTemplates.map((template) => {
                  const applied = appliedTemplate?.id === template.id;
                  const appendedContent = appendNoticeTemplateContent(
                    content,
                    template.content,
                  );
                  const appendDisabled =
                    appendedContent.length > NOTICE_MAX_LENGTH ||
                    getNoticeLineCount(appendedContent) >
                      NOTICE_MAX_VISIBLE_LINES ||
                    applied;

                  return (
                    <div
                      key={template.id}
                      className={`rounded-lg border bg-[var(--card)] p-2.5 transition ${
                        applied
                          ? "border-dunggeure-primary shadow-[0_0_0_1px_rgba(128,128,255,0.22)]"
                          : "border-[var(--border)]"
                      }`}
                    >
                      <div className="mb-1.5 flex items-start justify-between gap-2">
                        <span className="min-w-0 text-xs font-bold text-[var(--text)]">
                          {template.title}
                        </span>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => startTemplateEdit(template)}
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-secondary)] transition hover:border-dunggeure-light hover:text-dunggeure-primary"
                            aria-label="템플릿 수정"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTargetTemplate(template)}
                            disabled={templateBusy}
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-red-200 text-red-500 transition hover:bg-red-50 disabled:opacity-50"
                            aria-label="템플릿 삭제"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      <p className="line-clamp-3 whitespace-pre-line text-[11px] leading-snug text-[var(--text-secondary)]">
                        {template.content}
                      </p>
                      <div className="mt-2 flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => applyNoticeTemplate(template)}
                          className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                            applied
                              ? "border-dunggeure-primary bg-dunggeure-primary text-white hover:bg-dunggeure-dark"
                              : "border-dunggeure-primary text-dunggeure-primary hover:bg-dunggeure-lighter/30"
                          }`}
                        >
                          {applied ? "적용 취소" : "적용"}
                        </button>
                        <button
                          type="button"
                          onClick={() => appendNoticeTemplate(template)}
                          disabled={appendDisabled}
                          title={
                            appendDisabled
                              ? `${NOTICE_MAX_VISIBLE_LINES}줄을 넘으면 추가할 수 없습니다.`
                              : undefined
                          }
                          className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition hover:border-dunggeure-light hover:text-dunggeure-primary disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          추가
                        </button>
                      </div>
                    </div>
                  );
                })}
                {!noticeTemplates.length && !templatesLoading && (
                  <div className="rounded-lg border border-dashed border-[var(--border)] p-3 text-center text-xs text-[var(--text-secondary)]">
                    등록된 템플릿이 없습니다.
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>
      <AppDialog
        open={Boolean(deleteTargetTemplate)}
        title="공지 템플릿 삭제"
        description={
          deleteTargetTemplate
            ? `'${deleteTargetTemplate.title}' 템플릿을 삭제할까요? 삭제한 템플릿은 되돌릴 수 없습니다.`
            : ""
        }
        confirmText="삭제"
        cancelText="취소"
        variant="danger"
        busy={templateBusy}
        onConfirm={confirmDeleteNoticeTemplate}
        onClose={() => {
          if (!templateBusy) setDeleteTargetTemplate(null);
        }}
      />
    </>
  );
}
