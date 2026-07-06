import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  CalendarDecoration,
  MonthlyNotice,
  Sticker,
  StickerCategoryOption,
  User,
} from '@/types';

interface AuthState {
  user: User | null;
  isAdmin: boolean;
  token: string | null;
  hydrated: boolean;
  authNotice: string | null;
  passwordChangeDeferred: boolean;
  setUser: (user: User | null, token?: string | null) => void;
  hydrate: () => Promise<void>;
  deferPasswordChangeForSession: () => void;
  dismissAuthNotice: () => void;
  logout: () => Promise<void>;
}

const PASSWORD_CHANGE_DEFERRED_KEY = 'dunggeure-password-change-deferred-user';

function getDeferredPasswordChangeUserId() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(PASSWORD_CHANGE_DEFERRED_KEY);
  } catch {
    return null;
  }
}

function setDeferredPasswordChangeUserId(userId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(PASSWORD_CHANGE_DEFERRED_KEY, userId);
  } catch {
    // Session storage is only a convenience for this browser session.
  }
}

function clearDeferredPasswordChangeUserId() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PASSWORD_CHANGE_DEFERRED_KEY);
  } catch {
    // Ignore storage access errors.
  }
}

function isPasswordChangeDeferred(user: User | null) {
  return Boolean(
    user?.must_change_password && getDeferredPasswordChangeUserId() === user.id,
  );
}

function getAuthNotice(reason: unknown) {
  if (reason === 'session_replaced') {
    return '다른 기기 또는 브라우저에서 로그인되어 현재 로그인은 해제되었습니다.';
  }
  if (reason === 'signed_out') {
    return '다른 화면에서 로그아웃되어 현재 로그인은 해제되었습니다.';
  }
  if (reason === 'invalid_token') {
    return '로그인 세션이 만료되었거나 유효하지 않아 자동으로 로그아웃되었습니다.';
  }
  return '로그인 상태를 확인할 수 없어 자동으로 로그아웃되었습니다.';
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAdmin: false,
  token: null,
  hydrated: false,
  authNotice: null,
  passwordChangeDeferred: false,
  setUser: (user, token = null) =>
    set({
      user,
      isAdmin: user?.role === 'admin',
      token,
      authNotice: null,
      passwordChangeDeferred: isPasswordChangeDeferred(user),
    }),
  hydrate: async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      const { user, reason } = await res.json();
      const previousUser = get().user;
      const shouldNotifyAutoLogout =
        Boolean(previousUser) && !user && reason !== 'no_token';
      set({
        user,
        isAdmin: user?.role === 'admin',
        hydrated: true,
        passwordChangeDeferred: isPasswordChangeDeferred(user),
        authNotice: shouldNotifyAutoLogout
          ? getAuthNotice(reason)
          : get().authNotice,
      });
    } catch {
      set({ hydrated: true });
    }
  },
  deferPasswordChangeForSession: () => {
    const user = get().user;
    if (!user?.must_change_password) return;
    setDeferredPasswordChangeUserId(user.id);
    set({ passwordChangeDeferred: true });
  },
  dismissAuthNotice: () => set({ authNotice: null }),
  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      clearDeferredPasswordChangeUserId();
      set({
        user: null,
        isAdmin: false,
        token: null,
        authNotice: null,
        passwordChangeDeferred: false,
      });
    }
  },
}));

interface ThemeState {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
    }),
    { name: 'dunggeure-theme' }
  )
);

const SCHEDULE_MEDIA_CACHE_MAX_AGE = 10 * 60 * 1000;
const STICKER_CACHE_MAX_AGE = 10 * 60 * 1000;

type ScheduleMonthMediaCache = {
  savedAt: number;
  notice?: MonthlyNotice | null;
  decorations?: CalendarDecoration[];
};

interface ScheduleMediaCacheState {
  months: Record<string, ScheduleMonthMediaCache>;
  getMonth: (monthKey: string) => ScheduleMonthMediaCache | null;
  setMonth: (
    monthKey: string,
    patch: Omit<Partial<ScheduleMonthMediaCache>, 'savedAt'>,
  ) => void;
  clear: () => void;
}

function isFresh(savedAt: number, maxAge: number) {
  return Date.now() - savedAt <= maxAge;
}

export const useScheduleMediaCacheStore = create<ScheduleMediaCacheState>()(
  persist(
    (set, get) => ({
      months: {},
      getMonth: (monthKey) => {
        const cached = get().months[monthKey];
        if (!cached || !isFresh(cached.savedAt, SCHEDULE_MEDIA_CACHE_MAX_AGE)) {
          return null;
        }
        return cached;
      },
      setMonth: (monthKey, patch) =>
        set((state) => ({
          months: {
            ...state.months,
            [monthKey]: {
              ...(state.months[monthKey] ?? { savedAt: 0 }),
              ...patch,
              savedAt: Date.now(),
            },
          },
        })),
      clear: () => set({ months: {} }),
    }),
    {
      name: 'dunggeure-schedule-media-cache',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);

type StickerCache = {
  savedAt: number;
  stickers: Sticker[];
  categories: StickerCategoryOption[];
};

interface StickerCacheState {
  cache: StickerCache | null;
  getCache: () => StickerCache | null;
  setCache: (cache: Omit<StickerCache, 'savedAt'>) => void;
  clear: () => void;
}

export const useStickerCacheStore = create<StickerCacheState>()((set, get) => ({
  cache: null,
  getCache: () => {
    const cached = get().cache;
    if (!cached || !isFresh(cached.savedAt, STICKER_CACHE_MAX_AGE)) {
      return null;
    }
    return cached;
  },
  setCache: (cache) => set({ cache: { ...cache, savedAt: Date.now() } }),
  clear: () => set({ cache: null }),
}));
