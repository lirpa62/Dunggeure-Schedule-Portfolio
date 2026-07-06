import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/auth';
import { canConvertToWebp, convertImageToWebp } from '@/lib/image-optimization';
import { deleteR2Object, isR2Configured, uploadR2Buffer, uploadR2Object } from '@/lib/r2-storage';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_CAPTION_LENGTH = 80;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DECORATION_IMAGE_MAX_SIZE = 960;

export const runtime = 'nodejs';

function extensionFor(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  return file.type.split('/').pop() || 'bin';
}

async function removeDecorationObjects(
  supabase: ReturnType<typeof createAdminClient>,
  paths: Array<string | null | undefined>,
) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean) as string[]));
  for (const path of uniquePaths) {
    await deleteR2Object(path);
  }
  if (uniquePaths.length > 0) {
    await supabase.storage.from('schedule-images').remove(uniquePaths);
  }
}

function parseJsonField(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// GET /api/decorations?year=2025&month=1
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get('year') || '0');
  const month = parseInt(searchParams.get('month') || '0');

  if (!year || !month) {
    return NextResponse.json({ error: 'year, month 필요' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('calendar_decorations')
    .select('*')
    .eq('owner_year', year)
    .eq('owner_month', month);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ decorations: data ?? [] });
}

// POST /api/decorations - admin이 multipart로 업로드
// fields: file, owner_year, owner_month, cell_date (YYYY-MM-DD), span (1~7)
// span > 1이면 cell_date를 시작 셀로 그 주 row 내에서 가로 N칸을 차지.
// 같은 시작 셀에 데코가 있으면 교체. 다른 셀과 겹치면 409로 거부.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const file = form.get('file');
  const ownerYear = parseInt(String(form.get('owner_year') ?? '0'));
  const ownerMonth = parseInt(String(form.get('owner_month') ?? '0'));
  const cellDate = String(form.get('cell_date') ?? '').trim();
  const span = Math.max(1, Math.min(7, parseInt(String(form.get('span') ?? '1')) || 1));
  const caption = String(form.get('caption') ?? '').trim();
  const captionRich = parseJsonField(form.get('caption_rich'));
  const captionStyle = parseJsonField(form.get('caption_style'));

  const hasFile = file instanceof File;
  if (!hasFile && !caption) {
    return NextResponse.json({ error: '이미지 또는 문구를 입력하세요.' }, { status: 400 });
  }
  if (hasFile && !ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: '지원하지 않는 파일 형식입니다. (jpeg, png, webp, gif)' },
      { status: 400 },
    );
  }
  if (hasFile && file.size > MAX_BYTES) {
    return NextResponse.json({ error: '파일이 5MB를 초과합니다.' }, { status: 400 });
  }
  if (!ownerYear || !ownerMonth || ownerMonth < 1 || ownerMonth > 12) {
    return NextResponse.json({ error: 'owner_year/owner_month가 올바르지 않습니다.' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cellDate)) {
    return NextResponse.json({ error: 'cell_date 형식 오류' }, { status: 400 });
  }
  if (caption.length > MAX_CAPTION_LENGTH) {
    return NextResponse.json(
      { error: `문구는 ${MAX_CAPTION_LENGTH}자를 넘을 수 없습니다.` },
      { status: 400 },
    );
  }

  // 같은 주(SUN~SAT) 안에서만 span 허용 → 시작 셀의 요일(0=일)이 cellDate의 dow.
  // 시작 dow + span - 1 <= 6 이어야 한 row를 벗어나지 않음.
  const startDow = new Date(`${cellDate}T00:00:00`).getDay();
  if (startDow + span - 1 > 6) {
    return NextResponse.json(
      { error: '같은 주(일요일~토요일) 내에서만 합칠 수 있습니다.' },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // 충돌 검사: 새 데코가 차지할 셀 날짜 목록
  const occupiedDates: string[] = [];
  const startDate = new Date(`${cellDate}T00:00:00`);
  for (let i = 0; i < span; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    occupiedDates.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
  }

  // 같은 달의 모든 데코를 가져와 자바스크립트에서 충돌 검사
  // (start_dow + span으로 차지하는 모든 날짜를 계산)
  const { data: allDecos } = await supabase
    .from('calendar_decorations')
    .select('id, cell_date, span')
    .eq('owner_year', ownerYear)
    .eq('owner_month', ownerMonth);

  const ownStartDate = cellDate;
  const conflicting = (allDecos ?? []).find((deco) => {
    if (deco.cell_date === ownStartDate) return false; // 같은 시작 셀은 교체 대상
    const dStart = new Date(`${deco.cell_date}T00:00:00`);
    for (let i = 0; i < (deco.span ?? 1); i++) {
      const x = new Date(dStart);
      x.setDate(dStart.getDate() + i);
      const xStr = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
      if (occupiedDates.includes(xStr)) return true;
    }
    return false;
  });
  if (conflicting) {
    return NextResponse.json(
      { error: '이 범위의 다른 셀에 이미 데코가 있습니다. 먼저 해당 데코를 삭제하세요.' },
      { status: 409 },
    );
  }

  // 기존 데코(같은 시작 셀)가 있으면 storage 파일까지 정리하고 교체
  const { data: existing } = await supabase
    .from('calendar_decorations')
    .select('id, storage_path, original_storage_path')
    .eq('owner_year', ownerYear)
    .eq('owner_month', ownerMonth)
    .eq('cell_date', cellDate)
    .maybeSingle();

  let path: string | null = null;
  let publicUrl: string | null = null;
  let originalPath: string | null = null;
  let originalPublicUrl: string | null = null;

  if (hasFile) {
    const ext = extensionFor(file);
    const baseFilename = `${Date.now()}-${crypto.randomUUID()}`;
    const folder = `decorations/${ownerYear}-${String(ownerMonth).padStart(2, '0')}`;
    originalPath = `${folder}/originals/${baseFilename}.${ext}`;

    if (isR2Configured()) {
      try {
        const originalUploaded = await uploadR2Object(originalPath, file, {
          contentType: file.type,
          cacheControl: 'public, max-age=31536000, immutable',
        });
        originalPublicUrl = originalUploaded.url;

        if (canConvertToWebp(file)) {
          const webp = await convertImageToWebp(file, {
            maxWidth: DECORATION_IMAGE_MAX_SIZE,
            maxHeight: DECORATION_IMAGE_MAX_SIZE,
          });
          path = `${folder}/${baseFilename}.webp`;
          const uploaded = await uploadR2Buffer(path, webp.buffer, {
            contentType: webp.contentType,
            cacheControl: 'public, max-age=31536000, immutable',
          });
          publicUrl = uploaded.url;
        } else {
          path = originalPath;
          publicUrl = originalPublicUrl;
        }
      } catch (error) {
        await deleteR2Object(originalPath);
        await deleteR2Object(path);
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : 'R2 데코 이미지 업로드에 실패했습니다.',
          },
          { status: 500 },
        );
      }
    } else {
      const { error: originalUpErr } = await supabase.storage
        .from('schedule-images')
        .upload(originalPath, file, {
          contentType: file.type,
          cacheControl: '31536000',
        });
      if (originalUpErr) {
        return NextResponse.json({ error: originalUpErr.message }, { status: 500 });
      }

      const { data: originalPub } = supabase.storage
        .from('schedule-images')
        .getPublicUrl(originalPath);
      originalPublicUrl = originalPub.publicUrl;

      if (canConvertToWebp(file)) {
        const webp = await convertImageToWebp(file, {
          maxWidth: DECORATION_IMAGE_MAX_SIZE,
          maxHeight: DECORATION_IMAGE_MAX_SIZE,
        });
        path = `${folder}/${baseFilename}.webp`;
        const { error: upErr } = await supabase.storage
          .from('schedule-images')
          .upload(path, webp.buffer, {
            contentType: webp.contentType,
            cacheControl: '31536000',
          });
        if (upErr) {
          await supabase.storage.from('schedule-images').remove([originalPath]);
          return NextResponse.json({ error: upErr.message }, { status: 500 });
        }

        const { data: pub } = supabase.storage.from('schedule-images').getPublicUrl(path);
        publicUrl = pub.publicUrl;
      } else {
        path = originalPath;
        publicUrl = originalPublicUrl;
      }
    }
  }

  if (hasFile && (!path || !publicUrl || !originalPath || !originalPublicUrl)) {
    await removeDecorationObjects(supabase, [path, originalPath]);
    return NextResponse.json(
      { error: '데코 이미지 처리에 실패했습니다.' },
      { status: 500 },
    );
  }

  let saved;
  if (existing) {
    const updatePayload: Record<string, unknown> = {
      caption: caption || null,
      caption_rich: captionRich,
      caption_style: captionStyle,
      span,
      updated_at: new Date().toISOString(),
    };
    if (hasFile) {
      updatePayload.image_url = publicUrl;
      updatePayload.storage_path = path;
      updatePayload.original_image_url = originalPublicUrl;
      updatePayload.original_storage_path = originalPath;
    }
    const { data, error } = await supabase
      .from('calendar_decorations')
      .update(updatePayload)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) {
      await removeDecorationObjects(supabase, [path, originalPath]);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (hasFile) {
      await removeDecorationObjects(supabase, [
        existing.storage_path,
        existing.original_storage_path,
      ]);
    }
    saved = data;
  } else {
    const { data, error } = await supabase
      .from('calendar_decorations')
      .insert({
        owner_year: ownerYear,
        owner_month: ownerMonth,
        cell_date: cellDate,
        span,
        image_url: publicUrl,
        storage_path: path,
        original_image_url: originalPublicUrl,
        original_storage_path: originalPath,
        caption: caption || null,
        caption_rich: captionRich,
        caption_style: captionStyle,
        created_by: auth.id,
      })
      .select()
      .single();
    if (error) {
      await removeDecorationObjects(supabase, [path, originalPath]);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    saved = data;
  }

  return NextResponse.json({ decoration: saved });
}

// PATCH /api/decorations - admin이 데코 문구/스타일만 수정
// body: { id, caption, caption_rich?, caption_style? }
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id, caption, caption_rich, caption_style } = await req.json().catch(() => ({}));
  const decorationId = String(id ?? '').trim();
  const nextCaption = String(caption ?? '').trim();

  if (!decorationId) {
    return NextResponse.json({ error: 'id 누락' }, { status: 400 });
  }
  if (nextCaption.length > MAX_CAPTION_LENGTH) {
    return NextResponse.json(
      { error: `문구는 ${MAX_CAPTION_LENGTH}자를 넘을 수 없습니다.` },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('calendar_decorations')
    .update({
      caption: nextCaption || null,
      caption_rich: caption_rich ?? null,
      caption_style: caption_style ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', decorationId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ decoration: data });
}

// DELETE /api/decorations?id=xxx
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 누락' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from('calendar_decorations')
    .select('storage_path, original_storage_path')
    .eq('id', id)
    .maybeSingle();

  const { error: dbErr } = await supabase
    .from('calendar_decorations')
    .delete()
    .eq('id', id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  await removeDecorationObjects(supabase, [
    existing?.storage_path,
    existing?.original_storage_path,
  ]);

  return NextResponse.json({ success: true });
}
