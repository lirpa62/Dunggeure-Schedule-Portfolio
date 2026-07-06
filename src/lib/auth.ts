import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

const RAW_SECRET = process.env.JWT_SECRET;
if (!RAW_SECRET || RAW_SECRET.length < 32) {
  throw new Error(
    'JWT_SECRET 환경변수가 설정되지 않았거나 너무 짧습니다. 32자 이상의 임의 문자열을 .env.local 또는 배포 환경에 설정하세요.'
  );
}
const SECRET = new TextEncoder().encode(RAW_SECRET);

export const AUTH_COOKIE = 'dunggeure-token';

export async function signAuthToken(
  userId: string,
  role: string,
  expiresIn: string = '7d',
  sessionId?: string
) {
  return new SignJWT({ sub: userId, role, sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expiresIn)
    .sign(SECRET);
}

export async function verifyAuthToken(token: string) {
  const { payload } = await jwtVerify(token, SECRET);
  return payload as { sub: string; role: string; sid?: string; exp: number };
}

export type AuthedUser = { id: string; role: string };

export async function getAuthedUser(): Promise<AuthedUser | null> {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) return null;
  try {
    const payload = await verifyAuthToken(token);
    if (!payload.sid) return null;

    const supabase = createAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('role, auth_session_id')
      .eq('id', payload.sub)
      .single();

    if (!user || user.auth_session_id !== payload.sid) return null;
    return { id: payload.sub, role: user.role };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<AuthedUser | NextResponse> {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  return user;
}

export async function requireAdmin(): Promise<AuthedUser | NextResponse> {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (user.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }
  return user;
}
