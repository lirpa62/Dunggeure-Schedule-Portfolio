import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/auth';

const FALLBACK_CATEGORIES = [
  { value: 'dunggeure', label: '둥그레', sort_order: 0, is_default: true },
  { value: 'game', label: '게임', sort_order: 1, is_default: true },
  { value: 'football', label: '축구', sort_order: 2, is_default: true },
  { value: 'server', label: '서버', sort_order: 3, is_default: true },
  { value: 'etc', label: '기타', sort_order: 4, is_default: true },
];

function createCategoryValue(label: string) {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  return slug || `category-${Date.now().toString(36)}-${crypto
    .randomUUID()
    .slice(0, 6)}`;
}

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('sticker_categories')
    .select('*')
    .order('sort_order')
    .order('created_at');

  if (error) {
    return NextResponse.json({ categories: FALLBACK_CATEGORIES });
  }

  return NextResponse.json({ categories: data || FALLBACK_CATEGORIES });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const label = String(body.label || '').trim();
  if (!label) {
    return NextResponse.json({ error: '카테고리 이름을 입력하세요.' }, { status: 400 });
  }
  if (label.length > 20) {
    return NextResponse.json({ error: '카테고리 이름은 20자 이하로 입력하세요.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from('sticker_categories')
    .select('value')
    .eq('label', label)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: '이미 있는 카테고리입니다.' }, { status: 409 });
  }

  const { data: lastCategory } = await supabase
    .from('sticker_categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const baseValue = createCategoryValue(label);
  const value = `${baseValue}-${crypto.randomUUID().slice(0, 6)}`;
  const sortOrder =
    typeof lastCategory?.sort_order === 'number'
      ? lastCategory.sort_order + 1
      : 0;

  const { data, error } = await supabase
    .from('sticker_categories')
    .insert({
      value,
      label,
      sort_order: sortOrder,
      is_default: false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ category: data });
}
