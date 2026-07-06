import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { requireUser } from '@/lib/auth';

// PUT /api/auth/nickname - 본인 별명 수정
export async function PUT(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const { nickname } = await req.json();
  if (!nickname || nickname.length > 15) {
    return NextResponse.json({ error: '별명은 1~15자 이내여야 합니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: dup } = await supabase
    .from('users')
    .select('id')
    .eq('nickname', nickname)
    .neq('id', auth.id)
    .single();

  if (dup) {
    return NextResponse.json({ error: '이미 사용 중인 별명입니다.' }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('users')
    .update({ nickname, updated_at: new Date().toISOString() })
    .eq('id', auth.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: '별명 수정 실패' }, { status: 500 });
  }
  return NextResponse.json({ user: data });
}
