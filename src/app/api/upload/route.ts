import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/auth';
import { canConvertToWebp, convertImageToWebp } from '@/lib/image-optimization';
import { isR2Configured, uploadR2Buffer, uploadR2Object } from '@/lib/r2-storage';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const SCHEDULE_IMAGE_MAX_SIZE = 1280;

export const runtime = 'nodejs';

// POST /api/upload - 일정 이미지 업로드 (관리자 전용)
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const file = form.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: '파일이 누락되었습니다.' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: '지원하지 않는 파일 형식입니다. (jpeg, png, webp, gif)' },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: '파일이 5MB를 초과합니다.' }, { status: 400 });
  }

  const shouldConvert = canConvertToWebp(file);
  const ext = shouldConvert ? 'webp' : file.name.split('.').pop()?.toLowerCase() || 'bin';
  const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const path = `schedules/${filename}`;
  const webp = shouldConvert
    ? await convertImageToWebp(file, {
        maxWidth: SCHEDULE_IMAGE_MAX_SIZE,
        maxHeight: SCHEDULE_IMAGE_MAX_SIZE,
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
      return NextResponse.json(uploaded);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'R2 이미지 업로드에 실패했습니다.',
        },
        { status: 500 },
      );
    }
  }

  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from('schedule-images')
    .upload(path, webp?.buffer ?? file, {
      contentType: webp?.contentType ?? file.type,
      cacheControl: '31536000',
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = supabase.storage.from('schedule-images').getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, path });
}
