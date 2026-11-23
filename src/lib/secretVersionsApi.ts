import { api } from '@/lib/api';
import type { SecretVersion } from '@/types/api';

const enc = encodeURIComponent;

export const appSecretVersionsUrl = (appSlug: string, secretName: string, envSlug: string) =>
  `/applications/${appSlug}/secrets/${enc(secretName)}/versions/${enc(envSlug)}`;

export const globalSecretVersionsUrl = (secretName: string, envSlug: string) =>
  `/global/secrets/${enc(secretName)}/versions/${enc(envSlug)}`;

/** A secret's versions in one environment; none when the secret has no value there (404). */
export async function fetchSecretVersions(url: string): Promise<SecretVersion[]> {
  try {
    const res = await api.get<SecretVersion[]>(url);
    return Array.isArray(res.data) ? res.data : [];
  } catch (err: any) {
    if (err?.response?.status === 404) return [];
    throw err;
  }
}
