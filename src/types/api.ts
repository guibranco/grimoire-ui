export interface Application {
  name: string;
  slug: string;
  description?: string | null;
  createdAt?: string;
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
