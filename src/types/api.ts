export interface Application {
  name: string;
  slug: string;
  description: string;
  createdAt: string;
}

export interface Environment {
  name: string;
  slug: string;
}

export interface SecretValue {
  environmentSlug: string;
  version: number;
  isEnabled: boolean;
  expiresAt: string | null;
  notBefore: string | null;
  updatedAt: string;
}

export interface Secret {
  name: string;
  description: string;
  values: SecretValue[];
  createdAt: string;
}

export interface Configuration {
  key: string;
  value: string;
  description: string;
  environmentSlug: string;
  updatedAt: string;
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
