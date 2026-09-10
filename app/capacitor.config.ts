import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.feelgood.conduite',
  appName: 'FeelGood',
  webDir: 'dist',
  backgroundColor: '#0a0a0a',
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'FeelGood',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 400,
      launchAutoHide: true,
      backgroundColor: '#0a0a0a',
      showSpinner: false,
    },
    StatusBar: {
      // Fond sombre : texte clair (Style.Light).
      style: 'LIGHT',
      backgroundColor: '#0a0a0a',
    },
  },
};

export default config;
