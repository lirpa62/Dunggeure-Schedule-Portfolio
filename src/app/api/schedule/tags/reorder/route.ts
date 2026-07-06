import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/auth';

type ReorderItem = {
  id: string;
  sort_order: number;
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { items } = await req.json();
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: 'items 배열이 필요합니다.' }, { status: 400 });
  }

  const normalizedItems = items
    .map((item): ReorderItem | null => {
      if (!item || typeof item.id !== 'string') return null;
      const sortOrder = Number(item.sort_order);
      if (!Number.isFinite(sortOrder)) return null;
      return { id: item.id, sort_order: Math.max(0, Math.round(sortOrder)) };
    })
    .filter((item): item is ReorderItem => Boolean(item));

  if (normalizedItems.length !== items.length) {
    return NextResponse.json({ error: '잘못된 정렬 데이터입니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const results = await Promise.all(
    normalizedItems.map((item) =>
      supabase
        .from('schedule_tags')
        .update({ sort_order: item.sort_order })
        .eq('id', item.id),
    ),
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
