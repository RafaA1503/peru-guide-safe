import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.8fb5a5c57d9c4035823f557b27e82e9f',
  appName: 'peru-guide-safe',
  webDir: 'dist',
  server: {
    url: "https://8fb5a5c5-7d9c-4035-823f-557b27e82e9f.lovableproject.com?forceHideBadge=true",
    cleartext: true
  },
  plugins: {
    Camera: {
      permissions: ['camera', 'photos']
    },
    TextToSpeech: {
      // Configuración específica para TTS en dispositivos móviles
    }
  },
  android: {
    permissions: [
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE'
    ]
  },
  ios: {
    permissions: [
      'NSCameraUsageDescription',
      'NSMicrophoneUsageDescription'
    ]
  }
};

export default config;