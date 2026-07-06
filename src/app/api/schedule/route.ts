import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/auth';

function normalizeTime(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.replace(/\s+/g, '').toUpperCase();
  return v || null;
}

function getTimeSortValue(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const value = raw.replace(/\s+/g, '').toUpperCase();
  const kr = value.match(/^(오전|오후)(\d{1,2})(?:시(?:(\d{1,2})분)?|:(\d{1,2}))?$/);
  const en = value.match(/^(\d{1,2})(?::(\d{1,2}))?(AM|PM)$/);
  let period: 'AM' | 'PM';
  let hour: number;
  let minute: number;

  if (kr) {
    period = kr[1] === '오전' ? 'AM' : 'PM';
    hour = Number(kr[2]);
    minute = Number(kr[3] ?? kr[4] ?? 0);
  } else if (en) {
    period = en[3] as 'AM' | 'PM';
    hour = Number(en[1]);
    minute = Number(en[2] ?? 0);
  } else {
    return null;
  }

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  const hour24 = period === 'AM' ? hour % 12 : (hour % 12) + 12;
  return hour24 * 60 + minute;
}

// GET /api/schedule?year=2026&month=3
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const all = searchParams.get('all') === 'true';
  const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());
  const month = parseInt(searchParams.get('month') || (new Date().getMonth() + 1).toString());
  const supabase = createAdminClient();

  if (all) {
    const pageSize = 1000;
    const schedules = [];

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('schedules')
        .select('*, tag:schedule_tags(*)')
        .order('date')
        .order('sort_order')
        .order('created_at')
        .range(from, from + pageSize - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      schedules.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }

    return NextResponse.json({ schedules });
  }

  // 캘린더 그리드는 전월 말 ~ 다음월 초까지 보이므로 ±1주 여유를 두고 fetch
  const start = new Date(year, month - 1, 1);
  start.setDate(start.getDate() - 7);
  const end = new Date(year, month, 0); // 해당 월 마지막 날
  end.setDate(end.getDate() + 7);

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const startDate = fmt(start);
  const endDate = fmt(end);

  const { data: schedules, error } = await supabase
    .from('schedules')
    .select('*, tag:schedule_tags(*)')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')
    .order('sort_order')
    .order('created_at');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ schedules });
}

// POST /api/schedule - 일정 추가 (관리자 전용)
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const {
    date,
    time,
    tag_id,
    content,
    memo,
    collab_members,
    image_url,
    sort_order,
    meta,
  } = body;

  const supabase = createAdminClient();
  const normalizedTime = normalizeTime(time);
  let nextSortOrder = Number.isFinite(Number(sort_order))
    ? Number(sort_order)
    : 0;
  if (sort_order === undefined || sort_order === null) {
    const { data: daySchedules, error: daySchedulesError } = await supabase
      .from('schedules')
      .select('id, time, sort_order, created_at')
      .eq('date', date)
      .order('sort_order')
      .order('created_at');

    if (daySchedulesError) {
      return NextResponse.json(
        { error: daySchedulesError.message },
        { status: 500 },
      );
    }

    const newTimeValue = getTimeSortValue(normalizedTime);
    let insertIndex = daySchedules?.length ?? 0;
    if (newTimeValue !== null && daySchedules) {
      const laterIndex = daySchedules.findIndex((schedule) => {
        const scheduleTimeValue = getTimeSortValue(schedule.time);
        return scheduleTimeValue === null || scheduleTimeValue > newTimeValue;
      });
      if (laterIndex >= 0) insertIndex = laterIndex;
    }

    const reorderedSchedules = [...(daySchedules || [])];
    reorderedSchedules.splice(insertIndex, 0, {
      id: '',
      time: normalizedTime,
      sort_order: insertIndex,
      created_at: new Date().toISOString(),
    });
    nextSortOrder = insertIndex;

    for (let index = 0; index < reorderedSchedules.length; index += 1) {
      const schedule = reorderedSchedules[index];
      if (!schedule.id || schedule.sort_order === index) continue;
      const { error: reorderError } = await supabase
        .from('schedules')
        .update({ sort_order: index, updated_at: new Date().toISOString() })
        .eq('id', schedule.id);

      if (reorderError) {
        return NextResponse.json(
          { error: reorderError.message },
          { status: 500 },
        );
      }
    }
  }

  const { data, error } = await supabase
    .from('schedules')
    .insert({
      date,
      time: normalizedTime,
      tag_id: tag_id || null,
      content,
      memo: typeof memo === 'string' && memo.trim() ? memo.trim() : null,
      collab_members: collab_members || [],
      image_url: image_url || null,
      sort_order: nextSortOrder,
      meta: meta && typeof meta === 'object' ? meta : {},
      created_by: auth.id,
    })
    .select('*, tag:schedule_tags(*)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: daySchedules } = await supabase
    .from('schedules')
    .select('*, tag:schedule_tags(*)')
    .eq('date', date)
    .order('sort_order')
    .order('created_at');

  return NextResponse.json({ schedule: data, schedules: daySchedules || [data] });
}

// PUT /api/schedule - 일정 수정
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id, ...updates } = await req.json();
  if ('time' in updates) {
    updates.time = normalizeTime(updates.time);
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('schedules')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, tag:schedule_tags(*)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ schedule: data });
}

// DELETE /api/schedule?id=xxx
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  const supabase = createAdminClient();
  const { error } = await supabase.from('schedules').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
