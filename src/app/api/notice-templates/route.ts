import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/auth';

const MAX_TITLE_LENGTH = 30;
const MAX_CONTENT_LENGTH = 500;

const FALLBACK_TEMPLATES = [
  {
    id: 'default-monthly',
    title: '월간 안내',
    content:
      '이번 달 둥그레 방송 일정 안내입니다.\n일정은 상황에 따라 변경될 수 있으며, 변경 시 일정표에 반영됩니다.',
    sort_order: 0,
  },
  {
    id: 'default-change',
    title: '일정 변경',
    content:
      '방송 일정이 일부 변경되었습니다.\n변경된 일정은 캘린더에서 확인해 주세요.',
    sort_order: 1,
  },
  {
    id: 'default-break',
    title: '휴방 안내',
    content:
      '휴방 일정이 있습니다.\n자세한 날짜와 시간은 일정표를 확인해 주세요.',
    sort_order: 2,
  },
  {
    id: 'default-tournament',
    title: '대회 안내',
    content:
      '이번 달 대회 일정이 예정되어 있습니다.\n참가/중계 일정은 캘린더에 순차적으로 반영됩니다.',
    sort_order: 3,
  },
  {
    id: 'default-collab',
    title: '합방 안내',
    content:
      '합방 일정이 포함되어 있습니다.\n함께하는 멤버와 상세 내용은 각 일정에서 확인해 주세요.',
    sort_order: 4,
  },
  {
    id: 'default-time',
    title: '방송 시간 안내',
    content:
      '방송 시간은 당일 상황에 따라 조정될 수 있습니다.\n최신 일정은 캘린더 기준으로 확인해 주세요.',
    sort_order: 5,
  },
].map((template) => ({
  ...template,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
}));

function normalizePayload(body: Record<string, unknown>) {
  const title = String(body.title ?? '').trim();
  const content = String(body.content ?? '').trim();

  if (!title) return { error: '템플릿 이름을 입력하세요.' };
  if (title.length > MAX_TITLE_LENGTH) {
    return { error: `템플릿 이름은 ${MAX_TITLE_LENGTH}자 이하로 입력하세요.` };
  }
  if (!content) return { error: '템플릿 내용을 입력하세요.' };
  if (content.length > MAX_CONTENT_LENGTH) {
    return { error: `템플릿 내용은 ${MAX_CONTENT_LENGTH}자를 넘을 수 없습니다.` };
  }

  return { title, content };
}

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('notice_templates')
    .select('*')
    .order('sort_order')
    .order('created_at');

  if (error) {
    return NextResponse.json({ templates: FALLBACK_TEMPLATES });
  }

  return NextResponse.json({ templates: data ?? FALLBACK_TEMPLATES });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const normalized = normalizePayload(body);
  if ('error' in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: lastTemplate } = await supabase
    .from('notice_templates')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder =
    typeof lastTemplate?.sort_order === 'number'
      ? lastTemplate.sort_order + 1
      : 0;

  const { data, error } = await supabase
    .from('notice_templates')
    .insert({
      title: normalized.title,
      content: normalized.content,
      sort_order: sortOrder,
      created_by: auth.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? '').trim();
  if (!id) {
    return NextResponse.json({ error: '템플릿 ID가 필요합니다.' }, { status: 400 });
  }

  const normalized = normalizePayload(body);
  if ('error' in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('notice_templates')
    .update({
      title: normalized.title,
      content: normalized.content,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id')?.trim();
  if (!id) {
    return NextResponse.json({ error: '템플릿 ID가 필요합니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from('notice_templates').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
