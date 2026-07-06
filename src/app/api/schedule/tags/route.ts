import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/auth';

function normalizeOptionalText(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function buildTagPayload(body: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};
  if ('name' in body) payload.name = String(body.name || '').trim();
  if ('bg_color' in body) payload.bg_color = body.bg_color;
  if ('font_color' in body) payload.font_color = body.font_color;
  if ('border_color' in body) payload.border_color = body.border_color;
  if ('border_style' in body) {
    payload.border_style =
      body.border_style === 'solid' ||
      body.border_style === 'dashed' ||
      body.border_style === 'dotted' ||
      body.border_style === 'double'
        ? body.border_style
        : 'none';
  }
  if ('font_weight' in body) payload.font_weight = body.font_weight;
  if ('font_size' in body) {
    const fontSize = Number(body.font_size);
    payload.font_size = Number.isFinite(fontSize)
      ? Math.max(8, Math.min(28, Math.round(fontSize)))
      : null;
  }
  if ('text_align' in body) {
    payload.text_align =
      body.text_align === 'left' ||
      body.text_align === 'center' ||
      body.text_align === 'right'
        ? body.text_align
        : 'center';
  }
  if ('is_italic' in body) payload.is_italic = Boolean(body.is_italic);
  if ('is_underline' in body) payload.is_underline = Boolean(body.is_underline);
  if ('is_strikethrough' in body) {
    payload.is_strikethrough = Boolean(body.is_strikethrough);
  }
  if ('is_schedule_default' in body) {
    payload.is_schedule_default = Boolean(body.is_schedule_default);
  }
  if ('default_time' in body) {
    payload.default_time = normalizeOptionalText(body.default_time);
  }
  if ('default_content' in body) {
    payload.default_content = normalizeOptionalText(body.default_content);
  }
  return payload;
}

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('schedule_tags')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .order('name', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tags: data });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const payload = buildTagPayload(body);
  if (!payload.name) {
    return NextResponse.json({ error: '태그 이름을 입력해주세요.' }, { status: 400 });
  }
  const supabase = createAdminClient();
  if (payload.is_schedule_default) {
    await supabase
      .from('schedule_tags')
      .update({ is_schedule_default: false })
      .eq('is_schedule_default', true);
  }
  const { data: lastTag } = await supabase
    .from('schedule_tags')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  payload.sort_order =
    typeof lastTag?.sort_order === 'number' ? lastTag.sort_order + 1 : 0;

  const { data, error } = await supabase.from('schedule_tags').insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tag: data });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id, ...updates } = await req.json();
  const payload = buildTagPayload(updates);
  if ('name' in payload && !payload.name) {
    return NextResponse.json({ error: '태그 이름을 입력해주세요.' }, { status: 400 });
  }
  const supabase = createAdminClient();
  if (payload.is_schedule_default) {
    await supabase
      .from('schedule_tags')
      .update({ is_schedule_default: false })
      .neq('id', id);
  }
  const { data, error } = await supabase.from('schedule_tags').update(payload).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tag: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 누락' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from('schedule_tags')
    .select('is_protected')
    .eq('id', id)
    .single();
  if (existing?.is_protected) {
    return NextResponse.json(
      { error: '보호된 태그는 삭제할 수 없습니다.' },
      { status: 403 },
    );
  }

  const { error } = await supabase.from('schedule_tags').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
