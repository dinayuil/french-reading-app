import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cc.yosorano.frenchreading',
  appName: 'Lire en français',
  webDir: 'dist',
  server: {
    // Keep the WebView on a secure, stable origin so localStorage is
    // consistent with the browser build and secure APIs stay available.
    androidScheme: 'https',
    hostname: 'localhost',
  },
};

export default config;
