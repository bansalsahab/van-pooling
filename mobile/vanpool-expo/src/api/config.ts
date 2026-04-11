import { Platform } from 'react-native';

const FALLBACK_WEB_IOS_BASE = 'http://127.0.0.1:8000/api/v1';
const FALLBACK_ANDROID_EMULATOR_BASE = 'http://10.0.2.2:8000/api/v1';

function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.endsWith('/api/v1')) {
    return trimmed;
  }
  if (trimmed.endsWith('/api')) {
    return `${trimmed}/v1`;
  }
  return `${trimmed}/api/v1`;
}

function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) {
    return normalizeApiBaseUrl(fromEnv);
  }

  if (Platform.OS === 'android') {
    return FALLBACK_ANDROID_EMULATOR_BASE;
  }

  return FALLBACK_WEB_IOS_BASE;
}

export const API_BASE_URL = resolveApiBaseUrl();
