import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { AUTH_COOKIE, getAuthedUser } from '@/lib/auth';

export async function POST() {
  const authed = await getAuthedUser();
  if (authed) {
    const supabase = createAdminClient();
    await supabase
      .from('users')
      .update({ auth_session_id: null, updated_at: new Date().toISOString() })
      .eq('id', authed.id);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(AUTH_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return response;
}
