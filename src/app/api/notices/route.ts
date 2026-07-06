import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/auth';
import { deleteR2Object } from '@/lib/r2-storage';

const MAX_LENGTH = 500;

// GET /api/notices?year=2026&month=1
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get('year') || '0');
  const month = parseInt(searchParams.get('month') || '0');

  if (!year || !month) {
    return NextResponse.json({ error: 'year, month 필요' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('monthly_notices')
    .select('*')
    .eq('owner_year', year)
    .eq('owner_month', month)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notice: data ?? null });
}

// PUT /api/notices - admin이 공지 저장 (없으면 생성, 있으면 업데이트)
// body: { owner_year, owner_month, content, image_url?, image_storage_path? }
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { owner_year, owner_month, content, image_url, image_storage_path } =
    await req.json().catch(() => ({}));
  const ownerYear = parseInt(String(owner_year || 0));
  const ownerMonth = parseInt(String(owner_month || 0));
  const text = String(content ?? '').trim();
  const imageUrl = String(image_url ?? '').trim() || null;
  const imageStoragePath = String(image_storage_path ?? '').trim() || null;

  if (!ownerYear || !ownerMonth || ownerMonth < 1 || ownerMonth > 12) {
    return NextResponse.json({ error: 'owner_year/owner_month가 올바르지 않습니다.' }, { status: 400 });
  }
  if (text.length > MAX_LENGTH) {
    return NextResponse.json(
      { error: `공지는 ${MAX_LENGTH}자를 넘을 수 없습니다.` },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('monthly_notices')
    .select('id, image_storage_path')
    .eq('owner_year', ownerYear)
    .eq('owner_month', ownerMonth)
    .maybeSingle();

  // 내용과 이미지가 모두 비어 있으면 삭제
  if (text.length === 0 && !imageUrl) {
    const { error } = await supabase
      .from('monthly_notices')
      .delete()
      .eq('owner_year', ownerYear)
      .eq('owner_month', ownerMonth);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (existing?.image_storage_path) {
      await deleteR2Object(existing.image_storage_path);
      await supabase.storage
        .from('schedule-images')
        .remove([existing.image_storage_path]);
    }
    return NextResponse.json({ notice: null });
  }

  if (existing) {
    const { data, error } = await supabase
      .from('monthly_notices')
      .update({
        content: text,
        image_url: imageUrl,
        image_storage_path: imageStoragePath,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (
      existing.image_storage_path &&
      existing.image_storage_path !== imageStoragePath
    ) {
      await deleteR2Object(existing.image_storage_path);
      await supabase.storage
        .from('schedule-images')
        .remove([existing.image_storage_path]);
    }
    return NextResponse.json({ notice: data });
  } else {
    const { data, error } = await supabase
      .from('monthly_notices')
      .insert({
        owner_year: ownerYear,
        owner_month: ownerMonth,
        content: text,
        image_url: imageUrl,
        image_storage_path: imageStoragePath,
        created_by: auth.id,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ notice: data });
  }
}
