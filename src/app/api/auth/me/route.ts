import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase-admin';
import { AUTH_COOKIE, verifyAuthToken } from '@/lib/auth';

export async function GET() {
  const clearAuth = (reason: string) => {
    const response = NextResponse.json({ user: null, reason });
    response.cookies.set(AUTH_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });
    return response;
  };

  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ user: null, reason: 'no_token' });
  }

  try {
    const payload = await verifyAuthToken(token);
    if (!payload.sid) return clearAuth('invalid_token');

    const supabase = createAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, username, nickname, avatar_url, role, must_change_password, auth_session_id, created_at')
      .eq('id', payload.sub)
      .single();

    if (!user) return clearAuth('invalid_token');
    if (user.auth_session_id !== payload.sid) {
      return clearAuth(user.auth_session_id ? 'session_replaced' : 'signed_out');
    }

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatar_url: user.avatar_url,
        role: user.role,
        must_change_password: user.must_change_password,
        created_at: user.created_at,
      },
    });
  } catch {
    return clearAuth('invalid_token');
  }
}
