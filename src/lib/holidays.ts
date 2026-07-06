import Holidays from "date-holidays";

const hd = new Holidays("KR");
const yearMaps = new Map<number, Map<string, string>>();
const remoteLoaded = new Map<number, Promise<void>>();
const subscribers = new Set<() => void>();
const CUSTOM_HOLIDAYS = [
  { month: 7, day: 7, name: "둥그레 생일" },
] as const;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function normalizeHolidayName(date: string, name: string): string {
  if (date.endsWith("-12-25") && name === "기독탄신일") {
    return "크리스마스(기독탄신일)";
  }
  if (date.endsWith("-01-01") && name === "1월1일") {
    return "새해 첫날(1월 1일)";
  }
  return name;
}

function getOrCreateYearMap(year: number): Map<string, string> {
  let map = yearMaps.get(year);
  if (map) return map;

  map = new Map();
  const list = hd.getHolidays(year) as Array<{
    date: string;
    name: string;
    type: string;
  }>;
  for (const h of list) {
    if (h.type !== "public") continue;
    const key = h.date.slice(0, 10);
    if (!map.has(key)) map.set(key, normalizeHolidayName(key, h.name));
  }
  for (const holiday of CUSTOM_HOLIDAYS) {
    map.set(
      `${year}-${pad(holiday.month)}-${pad(holiday.day)}`,
      holiday.name,
    );
  }
  yearMaps.set(year, map);
  return map;
}

export function getHolidayName(date: Date): string | null {
  const map = getOrCreateYearMap(date.getFullYear());
  return map.get(dateKey(date)) ?? null;
}

export function isCustomHoliday(date: Date): boolean {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return CUSTOM_HOLIDAYS.some(
    (holiday) => holiday.month === month && holiday.day === day,
  );
}

// 공공 API 결과를 가져와서 기존 캐시에 머지. 같은 연도는 한 번만 호출.
export function loadHolidaysForYear(year: number): Promise<void> {
  const cached = remoteLoaded.get(year);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const res = await fetch(`/api/holidays?year=${year}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        holidays?: Array<{ date: string; name: string }>;
      };
      if (!data.holidays?.length) return;

      const map = getOrCreateYearMap(year);
      let changed = false;
      for (const { date, name } of data.holidays) {
        const normalizedName = normalizeHolidayName(date, name);
        if (map.get(date) !== normalizedName) {
          map.set(date, normalizedName);
          changed = true;
        }
      }
      for (const holiday of CUSTOM_HOLIDAYS) {
        const date = `${year}-${pad(holiday.month)}-${pad(holiday.day)}`;
        if (map.get(date) !== holiday.name) {
          map.set(date, holiday.name);
          changed = true;
        }
      }
      if (changed) {
        subscribers.forEach((fn) => fn());
      }
    } catch {
      // 네트워크 실패 시 date-holidays 결과로 폴백
    }
  })();

  remoteLoaded.set(year, promise);
  return promise;
}

export function subscribeHolidays(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
