import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/auth';

type ReorderItem = {
  id: string;
  date?: string;
  time?: string | null;
  sort_order?: number;
};

// POST /api/schedule/reorder
// body: { items: ReorderItem[] }
// 변경된 일정들의 date/time/sort_order를 일괄 업데이트.
// 실패하는 항목이 있으면 부분 성공 상태로 응답 (success/failed 분리).
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { items } = (await req.json()) as { items: ReorderItem[] };
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items가 누락되었습니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const failed: { id: string; error: string }[] = [];
  const updatedIds: string[] = [];

  for (const it of items) {
    if (!it.id) continue;
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (it.date !== undefined) updates.date = it.date;
    if (it.time !== undefined) updates.time = it.time;
    if (it.sort_order !== undefined) updates.sort_order = it.sort_order;

    const { error } = await supabase
      .from('schedules')
      .update(updates)
      .eq('id', it.id);

    if (error) {
      failed.push({ id: it.id, error: error.message });
    } else {
      updatedIds.push(it.id);
    }
  }

  if (failed.length > 0) {
    return NextResponse.json(
      { updated: updatedIds, failed },
      { status: 207 }, // Multi-Status
    );
  }
  return NextResponse.json({ updated: updatedIds });
}
