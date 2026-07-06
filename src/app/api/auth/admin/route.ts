import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import bcrypt from 'bcryptjs';
import { AUTH_COOKIE, requireAdmin, signAuthToken } from '@/lib/auth';

function authCookieResponse(body: unknown, token: string, maxAge: number) {
  const res = NextResponse.json(body);
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  });
  return res;
}

function publicUser(user: {
  id: string;
  username: string | null;
  nickname: string;
  avatar_url: string | null;
  role: 'admin' | 'user';
  must_change_password: boolean;
  created_at: string;
}) {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatar_url: user.avatar_url,
    role: user.role,
    must_change_password: user.must_change_password,
    created_at: user.created_at,
  };
}

// POST /api/auth/admin - 관리자 로그인
export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ error: '아이디와 비밀번호를 입력하세요.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .eq('role', 'admin')
    .eq('provider', 'local')
    .single();

  if (!user) {
    return NextResponse.json({ error: '관리자 계정을 찾을 수 없습니다.' }, { status: 401 });
  }

  // 최초 로그인 (패스워드 미설정 상태)
  if (!user.password_hash) {
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD;
    if (password !== initialPassword) {
      return NextResponse.json({ error: '비밀번호가 일치하지 않습니다.' }, { status: 401 });
    }
    // 비밀번호 변경 필요 플래그와 함께 토큰 발급
    const sessionId = crypto.randomUUID();
    const { error: sessionError } = await supabase
      .from('users')
      .update({ auth_session_id: sessionId, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (sessionError) {
      return NextResponse.json({ error: '로그인 세션 생성 실패' }, { status: 500 });
    }

    const token = await signAuthToken(user.id, 'admin', '1h', sessionId);
    return authCookieResponse(
      {
        user: publicUser(user),
        token,
        must_change_password: true,
      },
      token,
      60 * 60
    );
  }

  // 일반 로그인
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: '비밀번호가 일치하지 않습니다.' }, { status: 401 });
  }

  const sessionId = crypto.randomUUID();
  const { error: sessionError } = await supabase
    .from('users')
    .update({ auth_session_id: sessionId, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (sessionError) {
    return NextResponse.json({ error: '로그인 세션 생성 실패' }, { status: 500 });
  }

  const token = await signAuthToken(user.id, 'admin', '7d', sessionId);
  return authCookieResponse(
    {
      user: publicUser(user),
      token,
      must_change_password: user.must_change_password,
    },
    token,
    60 * 60 * 24 * 7
  );
}

// PUT /api/auth/admin - 본인 비밀번호 변경
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { currentPassword, newPassword } = await req.json();
  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json({ error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from('users')
    .select('password_hash, must_change_password')
    .eq('id', auth.id)
    .eq('role', 'admin')
    .single();

  if (!user) {
    return NextResponse.json({ error: '계정을 찾을 수 없습니다.' }, { status: 404 });
  }

  // 최초 로그인(must_change_password=true)이 아니면 현재 비밀번호 검증 필수
  if (!user.must_change_password) {
    if (!currentPassword) {
      return NextResponse.json({ error: '현재 비밀번호를 입력하세요.' }, { status: 400 });
    }
    const valid = await bcrypt.compare(currentPassword, user.password_hash ?? '');
    if (!valid) {
      return NextResponse.json({ error: '현재 비밀번호가 일치하지 않습니다.' }, { status: 401 });
    }
  }

  const hash = await bcrypt.hash(newPassword, 12);
  const { error } = await supabase
    .from('users')
    .update({ password_hash: hash, must_change_password: false })
    .eq('id', auth.id)
    .eq('role', 'admin');

  if (error) {
    return NextResponse.json({ error: '비밀번호 변경 실패' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
