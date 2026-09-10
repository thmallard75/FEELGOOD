/**
 * Coque native Capacitor (Android / iOS). No-op dans le navigateur.
 */

import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

export async function initNativeShell() {
  if (!isNative) return;

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: '#0a0a0a' });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch (err) {
    console.warn('[native] StatusBar:', err?.message || err);
  }

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch (err) {
    console.warn('[native] SplashScreen:', err?.message || err);
  }

  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack || window.history.length > 1) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });
    App.addListener('appUrlOpen', ({ url }) => {
      try {
        const parsed = new URL(url);
        const token = parsed.searchParams.get('access_token');
        if (token) {
          window.localStorage.setItem('base44_access_token', token);
          import('@capacitor/browser').then(({ Browser }) => Browser.close()).catch(() => {});
          window.location.replace('/');
        }
      } catch (e) {
        console.warn('[native] appUrlOpen:', e?.message || e);
      }
    });
  } catch (err) {
    console.warn('[native] App:', err?.message || err);
  }

  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    await Geolocation.requestPermissions();
  } catch (err) {
    console.warn('[native] Geolocation:', err?.message || err);
  }
}
