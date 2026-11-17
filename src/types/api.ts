export interface Application {
  name: string;
  slug: string;
  description?: string | null;
  inheritGlobals?: boolean;
  createdAt?: string;
}

/** Response of POST /management/applications — includes the one-time plain API key. */
export interface CreateApplicationResponse extends Application {
  id?: string;
  plainApiKey: string;
}

/** Response of POST /management/applications/{slug}/rotate-key. */
export interface RotateKeyResponse {
  plainApiKey: string;
}

export interface Environment {
  name: string;
  slug: string;
}

export interface SecretVersion {
  id?: string;
  version: number;
  isEnabled: boolean;
  expiresAt: string | null;
  notBefore: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Secret {
  id?: string;
  name: string;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Configuration {
  key: string;
  value: string;
  description?: string | null;
  environmentSlug: string;
  updatedAt?: string;
}

export interface GlobalConfiguration {
  id?: string;
  environmentSlug: string; // "*" = all environments
  key: string;
  value: string;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface GlobalEnvironment {
  slug: string;
  name: string;
  applicationCount: number;
}

export type ValueSource = 'application' | 'global';

export interface EffectiveConfiguration {
  key: string;
  value: string;
  description?: string | null;
  source: ValueSource;
  globalEnvironmentSlug?: string | null;
  overridesGlobal: boolean;
}

export interface EffectiveSecret {
  id?: string;
  name: string;
  description?: string | null;
  source: ValueSource;
  overridesGlobal: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export enum SecretStatus {
  ENABLED = 'enabled',
  DISABLED = 'disabled',
  EXPIRED = 'expired',
  PENDING = 'pending',
  MISSING = 'missing',
}
