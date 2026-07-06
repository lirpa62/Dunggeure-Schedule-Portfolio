// ============================================
// 둥그레 시간표 타입 정의
// ============================================

export interface User {
  id: string;
  username: string | null;
  nickname: string;
  avatar_url: string | null;
  role: "admin" | "user";
  must_change_password: boolean;
  created_at: string;
}

export interface ScheduleTag {
  id: string;
  name: string;
  bg_color: string;
  font_color: string;
  border_color: string | null;
  border_style: "none" | "solid" | "dashed" | "dotted" | "double" | null;
  font_weight: string;
  font_size: number | null;
  text_align: "left" | "center" | "right" | null;
  is_italic: boolean;
  is_underline: boolean;
  is_strikethrough: boolean;
  is_default: boolean;
  is_schedule_default: boolean;
  is_protected: boolean;
  default_time: string | null;
  default_content: string | null;
  sort_order: number;
}

export type ScheduleMeta = {
  venue?: "home" | "away";
  time_note?: string;
  time_note_position?: "before" | "after";
  time_note_gap?: 1 | 2;
  memo_position?: "before" | "after";
  memo_gap?: 1 | 2;
  content_style?: {
    font_weight?: "normal" | "bold";
    is_italic?: boolean;
    is_underline?: boolean;
    is_strikethrough?: boolean;
    font_size?: number;
    font_color?: string;
    bg_color?: string;
    text_align?: "left" | "center" | "right";
  };
  time_style?: {
    font_weight?: "normal" | "bold";
    is_italic?: boolean;
    is_underline?: boolean;
    is_strikethrough?: boolean;
    font_size?: number;
    font_color?: string;
    bg_color?: string;
    text_align?: "left" | "center" | "right";
  };
  content_rich?: ScheduleRichTextSegment[];
} & Record<string, unknown>;

export type ScheduleRichTextStyle = {
  font_weight?: "normal" | "bold";
  is_italic?: boolean;
  is_underline?: boolean;
  is_strikethrough?: boolean;
  font_size?: number;
  font_color?: string;
  bg_color?: string;
};

export type ScheduleRichTextSegment = {
  text: string;
  style?: ScheduleRichTextStyle;
};

export type StickerCategory = string;

export interface StickerCategoryOption {
  value: StickerCategory;
  label: string;
  sort_order?: number;
  is_default?: boolean;
}

export interface Sticker {
  id: string;
  category: StickerCategory;
  name: string;
  url: string;
  storage_path: string;
  sort_order: number;
  created_at: string;
  is_favorite?: boolean;
}

export interface CalendarDecoration {
  id: string;
  owner_year: number;
  owner_month: number; // 1~12
  cell_date: string; // YYYY-MM-DD (시작 셀)
  span: number; // 1~7, 같은 주 row 내에서 차지하는 셀 개수
  image_url: string | null;
  storage_path: string | null;
  original_image_url: string | null;
  original_storage_path: string | null;
  caption: string | null;
  caption_rich: ScheduleRichTextSegment[] | null;
  caption_style: ScheduleMeta["content_style"] | null;
  created_at: string;
  updated_at: string;
}

export interface MonthlyNotice {
  id: string;
  owner_year: number;
  owner_month: number; // 1~12
  content: string;
  image_url: string | null;
  image_storage_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoticeTemplate {
  id: string;
  title: string;
  content: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const STICKER_CATEGORIES: StickerCategoryOption[] = [
  { value: "dunggeure", label: "둥그레" },
  { value: "game", label: "게임" },
  { value: "server", label: "서버" },
  { value: "etc", label: "기타" },
];

export interface Schedule {
  id: string;
  date: string; // YYYY-MM-DD
  time: string | null;
  tag_id: string | null;
  tag?: ScheduleTag;
  content: string | null;
  memo: string | null;
  collab_members: string[];
  image_url: string | null;
  sort_order: number;
  meta: ScheduleMeta;
}

// Day colors
export const DAY_COLORS = {
  sunday: "#aa141d",
  monday: "#9a94d0",
  tuesday: "#9a94d0",
  wednesday: "#9a94d0",
  thursday: "#9a94d0",
  friday: "#9a94d0",
  saturday: "#8080FF",
  rest: "#d8d8d8",
  server_collab: "#e8e6ff",
  highlight: "#8080FF",
} as const;

export const THEME_COLORS = {
  primary: "#8080FF",
  primaryDark: "#9a94d0",
  primaryLight: "#c8c8ff",
  primaryLighter: "#f0f0ff",
  secondary: "#e8e6ff",
  tertiary: "#aa141d",
} as const;
