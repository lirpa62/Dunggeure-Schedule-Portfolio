'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AppDialog } from '@/components/common/AppDialog';
import { useAuthStore } from '@/stores';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);
  const passwordChangeDeferred = useAuthStore((s) => s.passwordChangeDeferred);
  const authNotice = useAuthStore((s) => s.authNotice);
  const dismissAuthNotice = useAuthStore((s) => s.dismissAuthNotice);

  useEffect(() => {
    hydrate();

    const handleFocus = () => {
      hydrate();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        hydrate();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = window.setInterval(hydrate, 30_000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated || !user?.must_change_password) return;
    if (passwordChangeDeferred) return;
    if (pathname === '/login') return;

    const returnTo = pathname || '/schedule';
    router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }, [
    hydrated,
    passwordChangeDeferred,
    pathname,
    router,
    user?.must_change_password,
  ]);

  return (
    <>
      {children}
      <AppDialog
        open={!!authNotice}
        title="로그인 안내"
        description={authNotice || undefined}
        confirmText="확인"
        onConfirm={dismissAuthNotice}
        onClose={dismissAuthNotice}
      />
    </>
  );
}
