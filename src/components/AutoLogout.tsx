import React, { useState, useEffect } from 'react';
import { auth, logout } from '../firebase';

interface AutoLogoutProps {
  children: React.ReactNode;
}

export function AutoLogout({ children }: AutoLogoutProps) {
  // Load saved timeout or default to 15 minutes for logout
  const [timeoutMs, setTimeoutMs] = useState(() => {
    const saved = localStorage.getItem('logout_timeout');
    // Default to 15 minutes if not set, or use the old lock_timeout if available but adapt it
    const oldLock = localStorage.getItem('lock_timeout');
    if (saved) return parseInt(saved, 10);
    if (oldLock) return parseInt(oldLock, 10);
    return 900000; // 15 minutes
  });

  useEffect(() => {
    if (!auth.currentUser) return;

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    let timerId: number;

    const performLogout = async () => {
      console.log('Automatic logout triggered due to inactivity');
      await logout();
    };

    const resetTimer = () => {
      window.clearTimeout(timerId);
      timerId = window.setTimeout(performLogout, timeoutMs);
    };

    events.forEach(event => window.addEventListener(event, resetTimer));
    
    timerId = window.setTimeout(performLogout, timeoutMs);

    // Listen for custom timeout update events if needed
    const handleTimeoutUpdate = (e: any) => {
      if (e.detail && typeof e.detail === 'number') {
        const newMs = e.detail * 60 * 1000;
        setTimeoutMs(newMs);
        localStorage.setItem('logout_timeout', newMs.toString());
      }
    };
    window.addEventListener('update-logout-timeout', handleTimeoutUpdate);

    return () => {
      events.forEach(event => window.removeEventListener(event, resetTimer));
      window.removeEventListener('update-logout-timeout', handleTimeoutUpdate);
      window.clearTimeout(timerId);
    };
  }, [timeoutMs]);

  return <>{children}</>;
}
