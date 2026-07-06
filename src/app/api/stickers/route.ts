import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/auth';
import { canConvertToWebp, convertImageToWebp } from '@/lib/image-optimization';
import { deleteR2Object, isR2Configured, uploadR2Buffer, uploadR2Object } from '@/lib/r2-storage';

const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const STICKER_IMAGE_MAX_SIZE = 512;

export const runtime = 'nodejs';

// GET /api/stickers?category=dunggeure
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');

  const supabase = createAdminClient();
  let query = supabase
    .from('stickers')
    .select('*')
    .order('category')
    .order('sort_order')
    .order('created_at');

  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: favorites } = await supabase
    .from('sticker_favorites')
    .select('sticker_id');
  const favoriteIds = new Set((favorites || []).map((item) => item.sticker_id));

  return NextResponse.json({
    stickers: (data || []).map((sticker) => ({
      ...sticker,
      is_favorite: favoriteIds.has(sticker.id),
    })),
  });
}

// POST /api/stickers - admin이 multipart로 업로드
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const file = form.get('file');
  const category = String(form.get('category') ?? '');
  const name = String(form.get('name') ?? '').trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: '파일이 누락되었습니다.' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: '지원하지 않는 파일 형식입니다. (jpeg, png, webp, gif)' },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: '파일이 2MB를 초과합니다.' }, { status: 400 });
  }
  if (!category) {
    return NextResponse.json({ error: '카테고리가 올바르지 않습니다.' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: '이름을 입력하세요.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: categoryRow, error: categoryError } = await supabase
    .from('sticker_categories')
    .select('value')
    .eq('value', category)
    .maybeSingle();

  if (categoryError) {
    return NextResponse.json({ error: categoryError.message }, { status: 500 });
  }
  if (!categoryRow) {
    return NextResponse.json({ error: '등록되지 않은 카테고리입니다.' }, { status: 400 });
  }

  const shouldConvert = canConvertToWebp(file);
  const ext = shouldConvert ? 'webp' : file.name.split('.').pop()?.toLowerCase() || 'bin';
  const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const path = isR2Configured()
    ? `stickers/${category}/${filename}`
    : `${category}/${filename}`;
  let publicUrl = '';
  const webp = shouldConvert
    ? await convertImageToWebp(file, {
        maxWidth: STICKER_IMAGE_MAX_SIZE,
        maxHeight: STICKER_IMAGE_MAX_SIZE,
      })
    : null;

  if (isR2Configured()) {
    try {
      const uploaded = webp
        ? await uploadR2Buffer(path, webp.buffer, {
            contentType: webp.contentType,
            cacheControl: 'public, max-age=31536000, immutable',
          })
        : await uploadR2Object(path, file, {
            contentType: file.type,
            cacheControl: 'public, max-age=31536000, immutable',
          });
      publicUrl = uploaded.url;
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'R2 스티커 업로드에 실패했습니다.',
        },
        { status: 500 },
      );
    }
  } else {
    const { error: upErr } = await supabase.storage
      .from('stickers')
      .upload(path, webp?.buffer ?? file, {
        contentType: webp?.contentType ?? file.type,
        cacheControl: '31536000',
      });
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const { data: pub } = supabase.storage.from('stickers').getPublicUrl(path);
    publicUrl = pub.publicUrl;
  }

  const { data: row, error: dbErr } = await supabase
    .from('stickers')
    .insert({
      category,
      name,
      url: publicUrl,
      storage_path: path,
      created_by: auth.id,
    })
    .select()
    .single();

  if (dbErr) {
    // Storage 정리
    await deleteR2Object(path);
    await supabase.storage.from('stickers').remove([path]);
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json({ sticker: row });
}

// PUT /api/stickers - admin이 스티커 이름/카테고리 수정
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id, name, category } = await req.json().catch(() => ({}));
  const stickerId = String(id || '');
  const nextName = String(name || '').trim();
  const nextCategory = String(category || '');

  if (!stickerId) {
    return NextResponse.json({ error: 'id 누락' }, { status: 400 });
  }
  if (!nextName) {
    return NextResponse.json({ error: '이름을 입력하세요.' }, { status: 400 });
  }
  if (!nextCategory) {
    return NextResponse.json({ error: '카테고리가 올바르지 않습니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: categoryRow, error: categoryError } = await supabase
    .from('sticker_categories')
    .select('value')
    .eq('value', nextCategory)
    .maybeSingle();

  if (categoryError) {
    return NextResponse.json({ error: categoryError.message }, { status: 500 });
  }
  if (!categoryRow) {
    return NextResponse.json({ error: '등록되지 않은 카테고리입니다.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('stickers')
    .update({ name: nextName, category: nextCategory })
    .eq('id', stickerId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sticker: data });
}

// DELETE /api/stickers?id=xxx
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 누락' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from('stickers')
    .select('storage_path')
    .eq('id', id)
    .single();

  const { error: dbErr } = await supabase.from('stickers').delete().eq('id', id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  if (existing?.storage_path) {
    await deleteR2Object(existing.storage_path);
    await supabase.storage.from('stickers').remove([existing.storage_path]);
  }

  return NextResponse.json({ success: true });
}
