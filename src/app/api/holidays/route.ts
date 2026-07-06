import { NextRequest, NextResponse } from "next/server";

// 공공데이터포털 특일정보 API에서 연도별 공휴일 목록을 가져온다.
// 응답: [{ date: "YYYY-MM-DD", name: "..." }, ...]
// 캐시: 24시간 (Next route segment cache)

type HolidayItem = { date: string; name: string };
const CUSTOM_HOLIDAYS = [
  { month: 7, day: 7, name: "둥그레 생일" },
] as const;

type ApiItem = {
  dateName: string;
  locdate: number | string;
  isHoliday: "Y" | "N";
};

// 공공데이터포털 특일정보 API. http가 정식 엔드포인트(https는 인증서 이슈로 502 자주 발생).
const ENDPOINT =
  "http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function locdateToISO(locdate: number | string): string | null {
  const s = String(locdate);
  if (!/^\d{8}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function getCustomHolidays(year: number): HolidayItem[] {
  return CUSTOM_HOLIDAYS.map((holiday) => ({
    date: `${year}-${pad(holiday.month)}-${pad(holiday.day)}`,
    name: holiday.name,
  }));
}

// serviceKey는 보통 이미 percent-encoded 상태로 발급되므로 그대로 붙이고,
// 나머지 파라미터만 인코딩한다. URL.searchParams를 쓰면 키를 다시 인코딩해서 실패함.
function buildUrl(serviceKey: string, year: number, month: number): string {
  const params = [
    `serviceKey=${serviceKey}`,
    `solYear=${year}`,
    `solMonth=${pad(month)}`,
    `numOfRows=50`,
    `_type=json`,
  ].join("&");
  return `${ENDPOINT}?${params}`;
}

async function fetchMonth(
  serviceKey: string,
  year: number,
  month: number,
): Promise<HolidayItem[]> {
  const url = buildUrl(serviceKey, year, month);
  const res = await fetch(url, {
    next: { revalidate: 60 * 60 * 24 },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`status ${res.status}: ${text.slice(0, 200)}`);
  }

  // 에러 시 정부 API가 XML/HTML을 돌려주는 경우가 있어 JSON 파싱을 안전하게 처리
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`invalid json: ${text.slice(0, 200)}`);
  }

  const body = (
    data as { response?: { body?: { items?: { item?: unknown } } } }
  )?.response?.body;
  const items = body?.items;
  if (!items) return [];

  const raw = items.item;
  const list: ApiItem[] = Array.isArray(raw)
    ? (raw as ApiItem[])
    : raw
      ? [raw as ApiItem]
      : [];

  return list
    .filter((it) => it.isHoliday === "Y")
    .map((it) => {
      const date = locdateToISO(it.locdate);
      return date ? { date, name: it.dateName } : null;
    })
    .filter((x): x is HolidayItem => x !== null);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || "0", 10);
  if (!year || year < 1900 || year > 2100) {
    return NextResponse.json({ error: "year 필요" }, { status: 400 });
  }

  const serviceKey = process.env.HOLIDAY_API_KEY;
  if (!serviceKey) {
    return NextResponse.json({
      holidays: getCustomHolidays(year),
      source: "custom",
    });
  }

  // 월 단위 조회를 12번 병렬 호출. 일부 월이 실패해도 성공분만 반환.
  const results = await Promise.allSettled(
    Array.from({ length: 12 }, (_, i) => fetchMonth(serviceKey, year, i + 1)),
  );

  const merged = new Map<string, string>();
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      for (const h of r.value) {
        if (!merged.has(h.date)) merged.set(h.date, h.name);
      }
    } else {
      errors.push(String(r.reason));
    }
  }
  for (const h of getCustomHolidays(year)) {
    merged.set(h.date, h.name);
  }

  if (merged.size === 0 && errors.length > 0) {
    return NextResponse.json(
      { holidays: [], source: "error", error: errors[0] },
      { status: 502 },
    );
  }

  const holidays: HolidayItem[] = Array.from(merged.entries())
    .map(([date, name]) => ({ date, name }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json(
    { holidays, source: "data.go.kr" },
    {
      headers: {
        "Cache-Control":
          "public, max-age=86400, stale-while-revalidate=604800",
      },
    },
  );
}
