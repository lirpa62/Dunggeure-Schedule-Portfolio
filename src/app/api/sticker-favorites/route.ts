import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { sticker_id } = await req.json().catch(() => ({}));
  const stickerId = String(sticker_id || '');
  if (!stickerId) {
    return NextResponse.json({ error: 'sticker_id 누락' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('sticker_favorites')
    .upsert({ sticker_id: stickerId });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const stickerId = searchParams.get('sticker_id');
  if (!stickerId) {
    return NextResponse.json({ error: 'sticker_id 누락' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('sticker_favorites')
    .delete()
    .eq('sticker_id', stickerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
