import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 1000;
const NO_TAG_FILTER_ID = '__NO_TAG__';

function parseLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function parseOffset(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function parseOrder(value: string | null): 'asc' | 'desc' {
  return value === 'asc' ? 'asc' : 'desc';
}

function applyBaseFilters(
  query: any,
  tagIds: string[],
  startDate: string | null,
  endDate: string | null,
) {
  let nextQuery = query;
  const includeNoTag = tagIds.includes(NO_TAG_FILTER_ID);
  const concreteTagIds = tagIds.filter((tagId) => tagId !== NO_TAG_FILTER_ID);
  if (includeNoTag && concreteTagIds.length > 0) {
    nextQuery = nextQuery.or(`tag_id.is.null,tag_id.in.(${concreteTagIds.join(',')})`);
  } else if (includeNoTag) {
    nextQuery = nextQuery.is('tag_id', null);
  } else if (concreteTagIds.length > 0) {
    nextQuery = nextQuery.in('tag_id', concreteTagIds);
  }
  if (startDate) nextQuery = nextQuery.gte('date', startDate);
  if (endDate) nextQuery = nextQuery.lte('date', endDate);
  return nextQuery;
}

function matchesSearchQuery(schedule: {
  content: string | null;
  memo: string | null;
  collab_members: string[] | null;
}, query: string) {
  const lowerQuery = query.toLocaleLowerCase();
  return (
    schedule.content?.toLocaleLowerCase().includes(lowerQuery) ||
    schedule.memo?.toLocaleLowerCase().includes(lowerQuery) ||
    schedule.collab_members?.some((member) =>
      member.toLocaleLowerCase().includes(lowerQuery),
    )
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q')?.trim() || '';
  const tagIds = (searchParams.get('tagIds') || '')
    .split(',')
    .map((tagId) => tagId.trim())
    .filter(Boolean);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const limit = parseLimit(searchParams.get('limit'));
  const offset = parseOffset(searchParams.get('offset'));
  const order = parseOrder(searchParams.get('order'));
  const supabase = createAdminClient();

  const hasSearchCriteria =
    Boolean(query) || tagIds.length > 0 || Boolean(startDate) || Boolean(endDate);
  if (!hasSearchCriteria) {
    return NextResponse.json({ schedules: [], nextOffset: 0, hasMore: false });
  }

  if (!query) {
    let scheduleQuery = supabase
      .from('schedules')
      .select('*, tag:schedule_tags(*)')
      .order('date', { ascending: order === 'asc' })
      .order('sort_order')
      .order('created_at')
      .range(offset, offset + limit - 1);

    scheduleQuery = applyBaseFilters(scheduleQuery, tagIds, startDate, endDate);
    const { data, error } = await scheduleQuery;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const schedules = data || [];
    return NextResponse.json({
      schedules,
      nextOffset: offset + schedules.length,
      hasMore: schedules.length === limit,
    });
  }

  const pageSize = 1000;
  let scannedOffset = 0;
  let matchedCount = 0;
  const schedules = [];
  let hasMore = false;

  while (true) {
    let scheduleQuery = supabase
      .from('schedules')
      .select('*, tag:schedule_tags(*)')
      .order('date', { ascending: order === 'asc' })
      .order('sort_order')
      .order('created_at')
      .range(scannedOffset, scannedOffset + pageSize - 1);

    scheduleQuery = applyBaseFilters(scheduleQuery, tagIds, startDate, endDate);
    const { data, error } = await scheduleQuery;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const page = data || [];
    for (const schedule of page) {
      if (!matchesSearchQuery(schedule, query)) continue;
      if (matchedCount >= offset && schedules.length < limit) {
        schedules.push(schedule);
      }
      matchedCount += 1;
      if (schedules.length === limit) {
        hasMore = true;
        break;
      }
    }

    if (hasMore || page.length < pageSize) break;
    scannedOffset += pageSize;
  }

  return NextResponse.json({
    schedules,
    nextOffset: offset + schedules.length,
    hasMore,
  });
}
