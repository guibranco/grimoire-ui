import { AxiosResponse, AxiosRequestConfig } from 'axios';

// Mock Database Initial State
const DEFAULT_APPLICATIONS = [
  {
    name: "Production Gateway",
    slug: "production-gateway",
    description: "Primary configuration container for Edge Proxy, Database connectors, and API gateways.",
    createdAt: "2026-06-20T10:00:00.000Z"
  },
  {
    name: "Auth Provider Security",
    slug: "auth-provider-security",
    description: "Private vault for OAuth credentials, SAML keys, and JSON Web Token signing secrets.",
    createdAt: "2026-06-21T12:30:00.000Z"
  }
];

const DEFAULT_ENVIRONMENTS: Record<string, { name: string, slug: string }[]> = {
  "production-gateway": [
    { name: "Production", slug: "production" },
    { name: "Staging", slug: "staging" },
    { name: "Development", slug: "development" }
  ],
  "auth-provider-security": [
    { name: "Production", slug: "production" },
    { name: "Staging", slug: "staging" }
  ]
};

const DEFAULT_SECRETS: Record<string, any[]> = {
  "production-gateway": [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "DATABASE_PASSWORDS",
      description: "Encrypted PostgreSQL server authentication keys for primary cluster.",
      createdAt: "2026-06-20T10:15:00.000Z",
      updatedAt: "2026-06-20T10:15:00.000Z"
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "REDIS_CACHE_TOKEN",
      description: "Distributed cache access tokens.",
      createdAt: "2026-06-20T11:00:00.000Z",
      updatedAt: "2026-06-20T11:00:00.000Z"
    }
  ],
  "auth-provider-security": [
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "JWT_SIGNING_SECRET",
      description: "Symmetric key for JWT validation and encryption tokens.",
      createdAt: "2026-06-21T12:45:00.000Z",
      updatedAt: "2026-06-21T12:45:00.000Z"
    }
  ]
};

const DEFAULT_SECRET_VERSIONS: Record<string, any[]> = {
  "production-gateway:DATABASE_PASSWORDS:production": [
    {
      id: "aaaa1111-1111-4111-8111-111111111111",
      version: 1,
      isEnabled: true,
      expiresAt: null,
      notBefore: null,
      createdAt: "2026-06-20T10:15:00.000Z"
    }
  ],
  "production-gateway:DATABASE_PASSWORDS:staging": [
    {
      id: "aaaa2222-2222-4222-8222-222222222222",
      version: 2,
      isEnabled: true,
      expiresAt: null,
      notBefore: null,
      createdAt: "2026-06-20T12:00:00.000Z"
    },
    {
      id: "aaaa2221-2222-4222-8222-222222222222",
      version: 1,
      isEnabled: true,
      expiresAt: null,
      notBefore: null,
      createdAt: "2026-06-20T10:20:00.000Z"
    }
  ],
  "production-gateway:REDIS_CACHE_TOKEN:production": [
    {
      id: "bbbb1111-1111-4111-8111-111111111111",
      version: 1,
      isEnabled: false,
      expiresAt: null,
      notBefore: null,
      createdAt: "2026-06-20T11:00:00.000Z"
    }
  ],
  "auth-provider-security:JWT_SIGNING_SECRET:production": [
    {
      id: "cccc3333-3333-4333-8333-333333333333",
      version: 3,
      isEnabled: true,
      expiresAt: "2027-06-21T12:45:00.000Z",
      notBefore: null,
      createdAt: "2026-06-21T12:45:00.000Z"
    },
    {
      id: "cccc2222-3333-4333-8333-333333333333",
      version: 2,
      isEnabled: true,
      expiresAt: null,
      notBefore: null,
      createdAt: "2026-06-21T12:30:00.000Z"
    },
    {
      id: "cccc1111-3333-4333-8333-333333333333",
      version: 1,
      isEnabled: true,
      expiresAt: null,
      notBefore: null,
      createdAt: "2026-06-21T12:00:00.000Z"
    }
  ]
};

const DEFAULT_CONFIGURATIONS: Record<string, any[]> = {
  "production-gateway": [
    {
      key: "MAX_DB_CONNECTIONS",
      value: "100",
      description: "The maximum pool size of Database connection pool.",
      environmentSlug: "production",
      updatedAt: "2026-06-20T10:10:00.000Z"
    },
    {
      key: "MAX_DB_CONNECTIONS",
      value: "20",
      description: "The maximum pool size of Database connection pool.",
      environmentSlug: "staging",
      updatedAt: "2026-06-20T10:10:00.000Z"
    },
    {
      key: "COMPRESSION_ENABLED",
      value: "true",
      description: "Gzip level responses compression switch.",
      environmentSlug: "production",
      updatedAt: "2026-06-20T10:12:00.000Z"
    }
  ]
};

// Storage Helpers
const isBrowser = typeof window !== 'undefined';

function getStored<T>(key: string, defaultValue: T): T {
  if (isBrowser) {
    const item = localStorage.getItem('grm_mock_' + key);
    if (item) {
      try {
        return JSON.parse(item);
      } catch (e) {
        // Fallback
      }
    }
  }
  return JSON.parse(JSON.stringify(defaultValue)); // deep clone
}

function saveStored<T>(key: string, data: T): void {
  if (isBrowser) {
    localStorage.setItem('grm_mock_' + key, JSON.stringify(data));
  }
}

// In-Memory Database instances
let applications = getStored('applications', DEFAULT_APPLICATIONS);
let environments = getStored('environments', DEFAULT_ENVIRONMENTS);
let secrets = getStored('secrets', DEFAULT_SECRETS);
let configurations = getStored('configurations', DEFAULT_CONFIGURATIONS);
let secretVersions = getStored<Record<string, any[]>>('secret_versions', DEFAULT_SECRET_VERSIONS);

function sanitizeSecretMetadata(secret: any) {
  if (!secret) return secret;
  const { values: _ignored, ...metadata } = secret;
  return metadata;
}

// Reset handler (useful for testing)
export function resetMockDatabase() {
  applications = JSON.parse(JSON.stringify(DEFAULT_APPLICATIONS));
  environments = JSON.parse(JSON.stringify(DEFAULT_ENVIRONMENTS));
  secrets = JSON.parse(JSON.stringify(DEFAULT_SECRETS));
  configurations = JSON.parse(JSON.stringify(DEFAULT_CONFIGURATIONS));
  secretVersions = JSON.parse(JSON.stringify(DEFAULT_SECRET_VERSIONS));
  if (isBrowser) {
    localStorage.removeItem('grm_mock_applications');
    localStorage.removeItem('grm_mock_environments');
    localStorage.removeItem('grm_mock_secrets');
    localStorage.removeItem('grm_mock_configurations');
    localStorage.removeItem('grm_mock_secret_versions');
  }
}

// REST Helper function to build response
function makeResponse(status: number, data: any, config: AxiosRequestConfig): Promise<AxiosResponse> {
  return Promise.resolve({
    data,
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
    headers: {},
    config
  } as AxiosResponse);
}

// Custom Axios Adapter
export function mockApiAdapter(config: AxiosRequestConfig): Promise<AxiosResponse> {
  // Parse clean path
  let path = config.url || '';
  if (config.baseURL && path.startsWith(config.baseURL)) {
    path = path.substring(config.baseURL.length);
  }
  
  // Normalize leading slash and remove domain or /management prefix if any
  path = path.replace(/^(https?:\/\/[^\/]+)?\/?/, '/');
  if (path.startsWith('/management/')) {
    path = path.substring('/management'.length);
  }

  const method = (config.method || 'GET').toUpperCase();
  
  // Extract query parameters
  const urlObj = new URL(path, 'http://localhost');
  const cleanPath = urlObj.pathname;
  const searchParams = urlObj.searchParams;

  // Safe parse request payloads (JSON strings or objects)
  let body: any = {};
  if (config.data) {
    if (typeof config.data === 'string') {
      try {
        body = JSON.parse(config.data);
      } catch (e) {
        body = config.data;
      }
    } else {
      body = config.data;
    }
  }

  // --- Router for patterns ---

  // 0. GET /version or /health
  if ((cleanPath === '/version' || cleanPath === '/health') && method === 'GET') {
    return makeResponse(200, { status: 'Healthy', version: '1.2.0-mock' }, config);
  }

  // 1. GET /applications
  if (cleanPath === '/applications' && method === 'GET') {
    return makeResponse(200, applications, config);
  }

  // 2. POST /applications
  if (cleanPath === '/applications' && method === 'POST') {
    const newApp = {
      name: body.name || 'New App',
      slug: body.slug || (body.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: body.description || '',
      createdAt: new Date().toISOString()
    };
    applications.push(newApp);
    saveStored('applications', applications);
    
    // Seed default environments
    environments[newApp.slug] = [
      { name: "Production", slug: "production" },
      { name: "Staging", slug: "staging" }
    ];
    saveStored('environments', environments);

    const apiKey = `grm_sec_key_${Math.random().toString(36).substring(2, 12)}`;
    return makeResponse(201, { ...newApp, apiKey }, config);
  }

  // 3. GET /applications/:appSlug
  let match = cleanPath.match(/^\/applications\/([^\/]+)$/);
  if (match && method === 'GET') {
    const slug = match[1];
    const app = applications.find(a => a.slug === slug);
    if (!app) {
      return makeResponse(404, { message: `Application ${slug} not found` }, config);
    }
    return makeResponse(200, app, config);
  }

  // 3b. PUT /applications/:appSlug
  if (match && method === 'PUT') {
    const slug = match[1];
    const app = applications.find(a => a.slug === slug);
    if (!app) {
      return makeResponse(404, { message: `Application ${slug} not found` }, config);
    }
    if (body.name !== undefined) app.name = body.name;
    if (body.description !== undefined) app.description = body.description;
    saveStored('applications', applications);
    return makeResponse(200, app, config);
  }

  // 4. DELETE /applications/:appSlug
  if (match && method === 'DELETE') {
    const slug = match[1];
    const index = applications.findIndex(a => a.slug === slug);
    if (index === -1) {
      return makeResponse(404, { message: `Application ${slug} not found` }, config);
    }
    applications.splice(index, 1);
    saveStored('applications', applications);
    
    delete environments[slug];
    delete secrets[slug];
    delete configurations[slug];
    
    saveStored('environments', environments);
    saveStored('secrets', secrets);
    saveStored('configurations', configurations);

    return makeResponse(200, { message: `Application ${slug} deleted successfully` }, config);
  }

  // 5. POST /applications/:appSlug/rotate-key
  match = cleanPath.match(/^\/applications\/([^\/]+)\/rotate-key$/);
  if (match && method === 'POST') {
    const newKey = `grm_sec_key_${Math.random().toString(36).substring(2, 12)}`;
    return makeResponse(200, { 
      message: "Security key rotated successfully", 
      apiKey: newKey,
      key: newKey
    }, config);
  }

  // 6. GET /applications/:appSlug/environments
  match = cleanPath.match(/^\/applications\/([^\/]+)\/environments$/);
  if (match && method === 'GET') {
    const slug = match[1];
    const appEnvs = environments[slug] || [];
    return makeResponse(200, appEnvs, config);
  }

  // 7. POST /applications/:appSlug/environments
  if (match && method === 'POST') {
    const slug = match[1];
    if (!environments[slug]) {
      environments[slug] = [];
    }
    const newEnv = {
      name: body.name || 'New Environment',
      slug: body.slug || (body.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    };
    environments[slug].push(newEnv);
    saveStored('environments', environments);
    return makeResponse(201, newEnv, config);
  }

  // 7b. DELETE /applications/:appSlug/environments/:envSlug
  match = cleanPath.match(/^\/applications\/([^\/]+)\/environments\/([^\/]+)$/);
  if (match && method === 'DELETE') {
    const appSlug = match[1];
    const envSlug = match[2];
    const appEnvs = environments[appSlug] || [];
    const index = appEnvs.findIndex(e => e.slug === envSlug);
    if (index === -1) {
      return makeResponse(404, { message: `Environment ${envSlug} not found` }, config);
    }
    appEnvs.splice(index, 1);
    saveStored('environments', environments);

    if (configurations[appSlug]) {
      configurations[appSlug] = configurations[appSlug].filter((c: any) => c.environmentSlug !== envSlug);
      saveStored('configurations', configurations);
    }

    return makeResponse(200, { message: `Environment ${envSlug} deleted successfully` }, config);
  }

  // 8. GET /applications/:appSlug/secrets
  match = cleanPath.match(/^\/applications\/([^\/]+)\/secrets$/);
  if (match && method === 'GET') {
    const slug = match[1];
    const appSecrets = (secrets[slug] || []).map(sanitizeSecretMetadata);
    return makeResponse(200, appSecrets, config);
  }

  // 9. POST /applications/:appSlug/secrets
  if (match && method === 'POST') {
    const slug = match[1];
    if (!secrets[slug]) {
      secrets[slug] = [];
    }
    const newSecretName = body.name || '';
    const existingIndex = secrets[slug].findIndex(s => s.name === newSecretName);
    const nowIso = new Date().toISOString();
    const newSecret = {
      id: existingIndex !== -1 ? secrets[slug][existingIndex].id : `sec-${Date.now()}`,
      name: newSecretName,
      description: body.description || '',
      createdAt: existingIndex !== -1 ? secrets[slug][existingIndex].createdAt : nowIso,
      updatedAt: nowIso
    };
    if (existingIndex !== -1) {
      secrets[slug][existingIndex] = newSecret;
    } else {
      secrets[slug].push(newSecret);
    }
    saveStored('secrets', secrets);
    return makeResponse(201, sanitizeSecretMetadata(newSecret), config);
  }

  // 10. POST /applications/:appSlug/secrets/:secretName/values
  match = cleanPath.match(/^\/applications\/([^\/]+)\/secrets\/([^\/]+)\/values$/);
  if (match && method === 'POST') {
    const appSlug = match[1];
    const secretName = decodeURIComponent(match[2]);
    const appSecrets = secrets[appSlug] || [];
    const secret = appSecrets.find(s => s.name === secretName);
    
    if (!secret) {
      return makeResponse(404, { message: `Secret ${secretName} not found` }, config);
    }

    const postedValues = Array.isArray(body) ? body : [body];
    
    postedValues.forEach((val: any) => {
      const historyKey = `${appSlug}:${secretName}:${val.environmentSlug}`;
      const existingVersions = secretVersions[historyKey] || [];
      const nextVersion = existingVersions.length > 0
        ? Math.max(...existingVersions.map((v: any) => v.version ?? 0)) + 1
        : 1;
      const nowIso = new Date().toISOString();

      const newVersionEntry = {
        id: `ver-${Date.now()}-${nextVersion}`,
        version: nextVersion,
        isEnabled: val.isEnabled !== undefined ? val.isEnabled : true,
        expiresAt: val.expiresAt || null,
        notBefore: val.notBefore || null,
        createdAt: nowIso,
      };

      secretVersions[historyKey] = [newVersionEntry, ...existingVersions];
      secret.updatedAt = nowIso;
    });

    saveStored('secrets', secrets);
    saveStored('secret_versions', secretVersions);
    return makeResponse(200, sanitizeSecretMetadata(secret), config);
  }

  // 10b. GET /applications/:appSlug/secrets/:secretName/versions/:envSlug
  match = cleanPath.match(/^\/applications\/([^\/]+)\/secrets\/([^\/]+)\/versions\/([^\/]+)$/);
  if (match && method === 'GET') {
    const appSlug = match[1];
    const secretName = decodeURIComponent(match[2]);
    const envSlug = decodeURIComponent(match[3]);
    const historyKey = `${appSlug}:${secretName}:${envSlug}`;
    const versions = secretVersions[historyKey] || [];
    return makeResponse(200, versions, config);
  }

  // 11a. GET /applications/:appSlug/secrets/:secretName
  match = cleanPath.match(/^\/applications\/([^\/]+)\/secrets\/([^\/]+)$/);
  if (match && method === 'GET') {
    const appSlug = match[1];
    const secretName = decodeURIComponent(match[2]);
    const appSecrets = secrets[appSlug] || [];
    const secret = appSecrets.find(s => s.name === secretName);
    if (!secret) {
      return makeResponse(404, { message: `Secret ${secretName} not found` }, config);
    }
    return makeResponse(200, sanitizeSecretMetadata(secret), config);
  }

  // 11b. DELETE /applications/:appSlug/secrets/:secretName
  if (match && method === 'DELETE') {
    const appSlug = match[1];
    const secretName = decodeURIComponent(match[2]);
    const appSecrets = secrets[appSlug] || [];
    const index = appSecrets.findIndex(s => s.name === secretName);
    if (index === -1) {
      return makeResponse(404, { message: `Secret ${secretName} not found` }, config);
    }
    appSecrets.splice(index, 1);
    const prefix = `${appSlug}:${secretName}:`;
    Object.keys(secretVersions).forEach((k) => {
      if (k.startsWith(prefix)) {
        delete secretVersions[k];
      }
    });
    saveStored('secrets', secrets);
    saveStored('secret_versions', secretVersions);
    return makeResponse(200, { message: `Secret ${secretName} deleted successfully` }, config);
  }

  // 12. GET /applications/:appSlug/configurations
  match = cleanPath.match(/^\/applications\/([^\/]+)\/configurations$/);
  if (match && method === 'GET') {
    const appSlug = match[1];
    const appConfigs = configurations[appSlug] || [];
    const envFilter = searchParams.get('environmentSlug') || config.params?.environmentSlug;
    
    const filtered = envFilter 
      ? appConfigs.filter(c => c.environmentSlug === envFilter)
      : appConfigs;
      
    return makeResponse(200, filtered, config);
  }

  // 13. POST /applications/:appSlug/configurations
  if (match && method === 'POST') {
    const appSlug = match[1];
    if (!configurations[appSlug]) {
      configurations[appSlug] = [];
    }
    
    const newConfigKey = body.key || '';
    const envSlug = body.environmentSlug;
    
    // Check if configuration already exists for this env
    const existingIndex = configurations[appSlug].findIndex(
      c => c.key === newConfigKey && c.environmentSlug === envSlug
    );
    
    const newConfig = {
      key: newConfigKey,
      value: body.value || '',
      description: body.description || '',
      environmentSlug: envSlug,
      updatedAt: new Date().toISOString()
    };
    
    if (existingIndex !== -1) {
      configurations[appSlug][existingIndex] = newConfig;
    } else {
      configurations[appSlug].push(newConfig);
    }
    
    saveStored('configurations', configurations);
    return makeResponse(201, newConfig, config);
  }

  // 14. PUT /applications/:appSlug/configurations/:envSlug/:key
  match = cleanPath.match(/^\/applications\/([^\/]+)\/configurations\/([^\/]+)\/([^\/]+)$/);
  if (match && method === 'PUT') {
    const appSlug = match[1];
    const envSlug = decodeURIComponent(match[2]);
    const key = decodeURIComponent(match[3]);
    
    const appConfigs = configurations[appSlug] || [];
    const configItem = appConfigs.find(c => c.key === key && c.environmentSlug === envSlug);
    
    if (!configItem) {
      return makeResponse(404, { message: `Configuration for key ${key} in environment ${envSlug} not found` }, config);
    }
    
    configItem.value = body.value !== undefined ? body.value : configItem.value;
    configItem.description = body.description !== undefined ? body.description : configItem.description;
    configItem.updatedAt = new Date().toISOString();
    
    saveStored('configurations', configurations);
    return makeResponse(200, configItem, config);
  }

  // 15. DELETE /applications/:appSlug/configurations/:envSlug/:key
  if (match && method === 'DELETE') {
    const appSlug = match[1];
    const envSlug = decodeURIComponent(match[2]);
    const key = decodeURIComponent(match[3]);
    
    const appConfigs = configurations[appSlug] || [];
    const index = appConfigs.findIndex(c => c.key === key && c.environmentSlug === envSlug);
    
    if (index === -1) {
      return makeResponse(404, { message: `Configuration for key ${key} in environment ${envSlug} not found` }, config);
    }
    
    appConfigs.splice(index, 1);
    saveStored('configurations', configurations);
    return makeResponse(200, { message: `Configuration key ${key} deleted successfully` }, config);
  }

  // Fallback for default request
  return makeResponse(404, { message: `Mock route not found: ${method} ${path}` }, config);
}
