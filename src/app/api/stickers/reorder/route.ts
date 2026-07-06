import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { items } = await req.json().catch(() => ({}));
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: 'items가 올바르지 않습니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const updates = items
    .map((item) => ({
      id: String(item?.id || ''),
      sort_order: Number(item?.sort_order),
    }))
    .filter((item) => item.id && Number.isFinite(item.sort_order));

  if (updates.length !== items.length) {
    return NextResponse.json({ error: '정렬 데이터가 올바르지 않습니다.' }, { status: 400 });
  }

  const results = await Promise.all(
    updates.map((item) =>
      supabase
        .from('stickers')
        .update({ sort_order: item.sort_order })
        .eq('id', item.id),
    ),
  );

  const failed = results.filter((result) => result.error);
  if (failed.length > 0) {
    return NextResponse.json(
      { error: failed[0].error?.message || '스티커 순서 저장에 실패했습니다.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
