import { describe, it, expect, beforeEach } from 'vitest';
import { api, fetchApiVersion, getApiConnectionInfo, toApiDateTime, UI_VERSION } from '../src/lib/api';
import { resetMockDatabase } from '../src/lib/mockApi';

describe('Grimoire Mock API Integration Tests', () => {
  // Before each test, enable mock API mode and reset the database state
  beforeEach(() => {
    localStorage.setItem('grimoire_api_url', 'mock://');
    localStorage.setItem('grimoire_api_key', 'mock_admin_key');
    resetMockDatabase();
  });

  describe('Applications API', () => {
    it('should list default mock applications', async () => {
      const res = await api.get('/applications');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data.length).toBeGreaterThanOrEqual(2);
      expect(res.data[0]).toHaveProperty('name', 'Production Gateway');
      expect(res.data[0]).toHaveProperty('slug', 'production-gateway');
    });

    it('should create a new application', async () => {
      const appData = {
        name: 'Billing Microservice',
        slug: 'billing-microservice',
        description: 'Mocked billing pipeline with high security keys.'
      };
      
      const res = await api.post('/applications', appData);
      expect(res.status).toBe(201);
      expect(res.data).toHaveProperty('name', 'Billing Microservice');
      expect(res.data).toHaveProperty('slug', 'billing-microservice');
      expect(res.data).toHaveProperty('plainApiKey');
      expect(res.data.plainApiKey.startsWith('grm_')).toBe(true);

      // Verify it was persisted by calling list
      const listRes = await api.get('/applications');
      const found = listRes.data.find((app: any) => app.slug === 'billing-microservice');
      expect(found).toBeDefined();
      expect(found.description).toBe('Mocked billing pipeline with high security keys.');
    });

    it('should fetch an application by slug', async () => {
      const res = await api.get('/applications/production-gateway');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('slug', 'production-gateway');
      expect(res.data).toHaveProperty('name', 'Production Gateway');
    });

    it('should rotate keys for an application', async () => {
      const res = await api.post('/applications/production-gateway/rotate-key');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('plainApiKey');
      expect(res.data.plainApiKey.startsWith('grm_')).toBe(true);
    });

    it('should delete an application', async () => {
      // First create one
      const appData = { name: 'Temp Application', description: 'To be deleted' };
      const createRes = await api.post('/applications', appData);
      const tempSlug = createRes.data.slug;

      // Delete it
      const deleteRes = await api.delete(`/applications/${tempSlug}`);
      expect(deleteRes.status).toBe(200);

      // Verify it is gone
      const listRes = await api.get('/applications');
      const found = listRes.data.find((app: any) => app.slug === tempSlug);
      expect(found).toBeUndefined();
    });
  });

  describe('Environments API', () => {
    it('should list environments for an application', async () => {
      const res = await api.get('/applications/production-gateway/environments');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('length', 3);
      expect(res.data[0]).toEqual({ name: "Production", slug: "production" });
    });

    it('should add a new environment to an application', async () => {
      const envData = { name: 'Local Testbed', slug: 'local-test' };
      const res = await api.post('/applications/production-gateway/environments', envData);
      expect(res.status).toBe(201);
      expect(res.data).toEqual(envData);

      // Verify listing returns it
      const listRes = await api.get('/applications/production-gateway/environments');
      expect(listRes.data).toContainEqual(envData);
    });
  });

  describe('Secrets API', () => {
    it('should list secrets for an application', async () => {
      const res = await api.get('/applications/production-gateway/secrets');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data.length).toBeGreaterThanOrEqual(1);
      expect(res.data[0]).toHaveProperty('name', 'DATABASE_PASSWORDS');
    });

    it('should define a new secret without exposing values', async () => {
      const secretData = { name: 'STRIPE_API_KEY', description: 'Stripe webhook security signature client.' };
      const res = await api.post('/applications/production-gateway/secrets', secretData);
      expect(res.status).toBe(201);
      expect(res.data).toHaveProperty('name', 'STRIPE_API_KEY');
      expect(res.data).not.toHaveProperty('values');

      // Verify in secrets list
      const listRes = await api.get('/applications/production-gateway/secrets');
      const found = listRes.data.find((s: any) => s.name === 'STRIPE_API_KEY');
      expect(found).toBeDefined();
      expect(found).not.toHaveProperty('values');
    });

    it('should create values and increment versions tracked via /versions/{envSlug}', async () => {
      const valData = [
        { environmentSlug: 'production', isEnabled: true, value: 'prod_pass_123', expiresAt: null, notBefore: null },
        { environmentSlug: 'staging', isEnabled: false, value: 'stage_pass_123', expiresAt: null, notBefore: null }
      ];

      const res = await api.post('/applications/production-gateway/secrets/DATABASE_PASSWORDS/values', valData);
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('name', 'DATABASE_PASSWORDS');
      expect(res.data).not.toHaveProperty('values');

      const prodVersions = await api.get('/applications/production-gateway/secrets/DATABASE_PASSWORDS/versions/production');
      expect(prodVersions.status).toBe(200);
      expect(prodVersions.data[0].isEnabled).toBe(true);
      // DATABASE_PASSWORDS version started at 1 by default, updating it should increment to 2
      expect(prodVersions.data[0].version).toBe(2);
      expect(prodVersions.data[0]).not.toHaveProperty('value');

      const stageVersions = await api.get('/applications/production-gateway/secrets/DATABASE_PASSWORDS/versions/staging');
      expect(stageVersions.status).toBe(200);
      expect(stageVersions.data[0].isEnabled).toBe(false);
      // DATABASE_PASSWORDS staging value started at version 2, updating it should increment to 3
      expect(stageVersions.data[0].version).toBe(3);
      expect(stageVersions.data[0]).not.toHaveProperty('value');
    });

    it('should delete a secret and all its values', async () => {
      const res = await api.delete('/applications/production-gateway/secrets/REDIS_CACHE_TOKEN');
      expect(res.status).toBe(200);

      const listRes = await api.get('/applications/production-gateway/secrets');
      const found = listRes.data.find((s: any) => s.name === 'REDIS_CACHE_TOKEN');
      expect(found).toBeUndefined();
    });
  });

  describe('Configurations API', () => {
    it('should list configurations, optionally filtered by environment', async () => {
      const res = await api.get('/applications/production-gateway/configurations', {
        params: { environmentSlug: 'production' }
      });
      expect(res.status).toBe(200);
      expect(res.data.length).toBe(2);
      expect(res.data[0]).toHaveProperty('key', 'MAX_DB_CONNECTIONS');
      expect(res.data[0]).toHaveProperty('environmentSlug', 'production');
    });

    it('should define a new configuration mapping', async () => {
      const configData = {
        key: 'PORT_ALLOCATION',
        value: '8080',
        description: 'Server bind port allocation',
        environmentSlug: 'staging'
      };

      const res = await api.post('/applications/production-gateway/configurations', configData);
      expect(res.status).toBe(201);
      expect(res.data).toHaveProperty('key', 'PORT_ALLOCATION');
      expect(res.data).toHaveProperty('value', '8080');

      // Verify list contains it
      const listRes = await api.get('/applications/production-gateway/configurations', {
        params: { environmentSlug: 'staging' }
      });
      const found = listRes.data.find((c: any) => c.key === 'PORT_ALLOCATION');
      expect(found).toBeDefined();
      expect(found.value).toBe('8080');
    });

    it('should update an existing configuration mapping', async () => {
      const updateData = { value: '250', description: 'Updated DB Pool size limits.' };
      const res = await api.put('/applications/production-gateway/configurations/production/MAX_DB_CONNECTIONS', updateData);
      expect(res.status).toBe(200);
      expect(res.data.value).toBe('250');
      expect(res.data.description).toBe('Updated DB Pool size limits.');
    });

    it('should delete a configuration mapping', async () => {
      const res = await api.delete('/applications/production-gateway/configurations/production/COMPRESSION_ENABLED');
      expect(res.status).toBe(200);

      // Verify is deleted
      const listRes = await api.get('/applications/production-gateway/configurations', {
        params: { environmentSlug: 'production' }
      });
      const found = listRes.data.find((c: any) => c.key === 'COMPRESSION_ENABLED');
      expect(found).toBeUndefined();
    });
  });

  describe('Connection & Version Info', () => {
    it('should return MOCK connection info when connected to mock://', () => {
      localStorage.setItem('grimoire_api_url', 'mock://');
      const info = getApiConnectionInfo();
      expect(info.isMock).toBe(true);
      expect(info.label).toBe('MOCK');
    });

    it('should extract host/domain for remote API servers', () => {
      localStorage.setItem('grimoire_api_url', 'https://vault.example.com:8443/management');
      const info = getApiConnectionInfo();
      expect(info.isMock).toBe(false);
      expect(info.label).toBe('vault.example.com:8443');
    });

    it('should fetch mock API version and expose UI_VERSION', async () => {
      localStorage.setItem('grimoire_api_url', 'mock://');
      const apiVersion = await fetchApiVersion();
      expect(apiVersion).toBe('1.2.0-mock');
      expect(UI_VERSION).toBeTruthy();
    });

    it('should format date strings to ISO date-time or null', () => {
      expect(toApiDateTime('')).toBeNull();
      expect(toApiDateTime(null)).toBeNull();
      expect(toApiDateTime('2026-11-15')).toBe('2026-11-15T00:00:00.000Z');
    });
  });

  describe('Additional Swagger v1.2.0 Endpoints', () => {
    it('should update an application via PUT /applications/:slug', async () => {
      const res = await api.put('/applications/production-gateway', {
        name: 'Production Gateway v2',
        description: 'Updated gateway description'
      });
      expect(res.status).toBe(200);
      expect(res.data.name).toBe('Production Gateway v2');
      expect(res.data.description).toBe('Updated gateway description');
    });

    it('should delete an environment via DELETE /applications/:slug/environments/:envSlug', async () => {
      const res = await api.delete('/applications/production-gateway/environments/development');
      expect(res.status).toBe(200);

      const listRes = await api.get('/applications/production-gateway/environments');
      expect(listRes.data.find((e: any) => e.slug === 'development')).toBeUndefined();
    });

    it('should fetch a single secret and its version history', async () => {
      const secretRes = await api.get('/applications/production-gateway/secrets/DATABASE_PASSWORDS');
      expect(secretRes.status).toBe(200);
      expect(secretRes.data.name).toBe('DATABASE_PASSWORDS');

      const versionsRes = await api.get('/applications/production-gateway/secrets/DATABASE_PASSWORDS/versions/staging');
      expect(versionsRes.status).toBe(200);
      expect(Array.isArray(versionsRes.data)).toBe(true);
      expect(versionsRes.data.length).toBe(2);
      expect(versionsRes.data[0].version).toBe(2);
    });
  });

  describe('Global Configuration, Secrets & Inheritance Precedence', () => {
    it('should list global environments, global configurations, and global secrets', async () => {
      const envRes = await api.get('/global/environments');
      expect(envRes.status).toBe(200);
      const prodEnv = envRes.data.find((e: any) => e.slug === 'production');
      expect(prodEnv).toBeDefined();
      expect(prodEnv.applicationCount).toBeGreaterThanOrEqual(2);

      const configRes = await api.get('/global/configurations');
      expect(configRes.status).toBe(200);
      expect(configRes.data.some((c: any) => c.environmentSlug === '*' && c.key === 'LogStream:Url')).toBe(true);

      const filteredRes = await api.get('/global/configurations?environment=production');
      expect(filteredRes.status).toBe(200);
      expect(filteredRes.data.every((c: any) => c.environmentSlug === 'production')).toBe(true);

      const secretRes = await api.get('/global/secrets');
      expect(secretRes.status).toBe(200);
      expect(secretRes.data.some((s: any) => s.name === 'Sentry--Dsn')).toBe(true);
      expect(secretRes.data[0]).not.toHaveProperty('values');
    });

    it('should support CRUD on global configurations and return 409 on duplicate', async () => {
      const createRes = await api.post('/global/configurations', {
        environmentSlug: '*',
        key: 'Global:Region',
        value: 'us-east-1',
        description: 'Default region',
      });
      expect(createRes.status).toBe(201);

      const dupRes = await api.post('/global/configurations', {
        environmentSlug: '*',
        key: 'Global:Region',
        value: 'eu-west-1',
      });
      expect(dupRes.status).toBe(409);

      const updateRes = await api.put('/global/configurations/%2A/Global%3ARegion', {
        value: 'eu-central-1',
        description: 'Updated region',
      });
      expect(updateRes.status).toBe(200);
      expect(updateRes.data.value).toBe('eu-central-1');

      const delRes = await api.delete('/global/configurations/%2A/Global%3ARegion');
      expect(delRes.status).toBe(204);
    });

    it('should enforce effective precedence: app > env-slug global > * global and overridesGlobal flag', async () => {
      // Seed global "*" and "production" for the same key, plus an app override
      await api.post('/global/configurations', {
        environmentSlug: '*',
        key: 'PrecedenceKey',
        value: 'from-wildcard',
      });
      await api.post('/global/configurations', {
        environmentSlug: 'production',
        key: 'PrecedenceKey',
        value: 'from-global-prod',
      });

      // Staging has no env-specific global, so "*" wins
      const stagingEffective = await api.get('/applications/production-gateway/configurations/effective?environment=staging');
      const stagingEntry = stagingEffective.data.find((e: any) => e.key === 'PrecedenceKey');
      expect(stagingEntry).toMatchObject({
        value: 'from-wildcard',
        source: 'global',
        globalEnvironmentSlug: '*',
        overridesGlobal: false,
      });

      // Production has env-specific global, so "production" global beats "*"
      const prodEffective1 = await api.get('/applications/production-gateway/configurations/effective?environment=production');
      const prodEntry1 = prodEffective1.data.find((e: any) => e.key === 'PrecedenceKey');
      expect(prodEntry1).toMatchObject({
        value: 'from-global-prod',
        source: 'global',
        globalEnvironmentSlug: 'production',
        overridesGlobal: false,
      });

      // Now add app-level override in production
      await api.post('/applications/production-gateway/configurations', {
        environmentSlug: 'production',
        key: 'PrecedenceKey',
        value: 'from-app-override',
      });

      const prodEffective2 = await api.get('/applications/production-gateway/configurations/effective?environment=production');
      const prodEntry2 = prodEffective2.data.find((e: any) => e.key === 'PrecedenceKey');
      expect(prodEntry2).toMatchObject({
        value: 'from-app-override',
        source: 'application',
        overridesGlobal: true,
      });
    });

    it('should hide inherited configurations and secrets when application sets inheritGlobals: false', async () => {
      await api.put('/applications/production-gateway', {
        name: 'Production Gateway',
        description: 'Gateway',
        inheritGlobals: false,
      });

      const effConfigs = await api.get('/applications/production-gateway/configurations/effective?environment=production');
      expect(effConfigs.data.some((c: any) => c.source === 'global')).toBe(false);
      expect(effConfigs.data.every((c: any) => c.overridesGlobal === false)).toBe(true);

      const effSecrets = await api.get('/applications/production-gateway/secrets/effective');
      expect(effSecrets.data.some((s: any) => s.source === 'global')).toBe(false);
      expect(effSecrets.data.every((s: any) => s.overridesGlobal === false)).toBe(true);
    });

    it('should create global secrets, add wildcard versions, and delete them cleanly', async () => {
      const createRes = await api.post('/global/secrets', {
        name: 'GLOBAL_API_KEY',
        description: 'Shared key',
      });
      expect(createRes.status).toBe(201);
      expect(createRes.data).not.toHaveProperty('values');

      await api.post('/global/secrets/GLOBAL_API_KEY/values', [
        { environmentSlug: '*', value: 'secret-val', isEnabled: true, expiresAt: null, notBefore: null },
      ]);

      const versionsRes = await api.get('/global/secrets/GLOBAL_API_KEY/versions/%2A');
      expect(versionsRes.status).toBe(200);
      expect(versionsRes.data[0].version).toBe(1);
      expect(versionsRes.data[0]).not.toHaveProperty('value');

      const delRes = await api.delete('/global/secrets/GLOBAL_API_KEY');
      expect(delRes.status).toBe(204);
    });
  });
  describe('Rotation API (guibranco/grimoire-api#78)', () => {
    it('lists expiring, rotation-due and expired secrets, soonest first', async () => {
      const res = await api.get('/secrets/expiring', { params: { withinDays: 30 } });
      expect(res.status).toBe(200);
      expect(res.data.withinDays).toBe(30);
      const items = res.data.items as any[];
      const find = (secret: string, env: string) => items.find((i) => i.secret === secret && i.environment === env);
      expect(find('DATABASE_PASSWORDS', 'development')).toMatchObject({ reason: 'expired', application: 'production-gateway', isGlobal: false });
      expect(find('JWT_SIGNING_SECRET', 'staging')).toMatchObject({ reason: 'expiry', daysRemaining: 5, rotationIntervalDays: 90 });
      expect(find('JWT_SIGNING_SECRET', 'production')).toMatchObject({ reason: 'rotation', version: 3 });
      expect(items.every((i) => !('value' in i))).toBe(true);
      const times = items.map((i) => new Date(i.dueAt).getTime());
      expect(times).toEqual([...times].sort((a, b) => a - b));
    });

    it('applies the window but always keeps overdue secrets', async () => {
      const items = (await api.get('/secrets/expiring', { params: { withinDays: 0 } })).data.items as any[];
      expect(items.some((i) => i.secret === 'JWT_SIGNING_SECRET' && i.environment === 'staging')).toBe(false);
      expect(items.some((i) => i.reason === 'expired')).toBe(true);
    });

    it('rejects an out-of-range window', async () => {
      expect((await api.get('/secrets/expiring', { params: { withinDays: 4000 } })).status).toBe(400);
    });

    it('stores the rotation interval on create and edits it with PATCH', async () => {
      await api.post('/applications/production-gateway/secrets', { name: 'NEW_KEY', description: 'x', rotationIntervalDays: 10 });
      await api.post('/applications/production-gateway/secrets/NEW_KEY/values', [{ environmentSlug: 'production', value: 'v' }]);
      let items = (await api.get('/secrets/expiring')).data.items as any[];
      expect(items.find((i) => i.secret === 'NEW_KEY')).toMatchObject({ reason: 'rotation', daysRemaining: 10 });

      const patched = await api.patch('/applications/production-gateway/secrets/NEW_KEY', { rotationIntervalDays: 365 });
      expect(patched.status).toBe(200);
      expect(patched.data.rotationIntervalDays).toBe(365);
      items = (await api.get('/secrets/expiring')).data.items as any[];
      expect(items.find((i) => i.secret === 'NEW_KEY')).toBeUndefined();

      const cleared = await api.patch('/applications/production-gateway/secrets/NEW_KEY', { clearRotationInterval: true, description: 'y' });
      expect(cleared.data).toMatchObject({ rotationIntervalDays: null, description: 'y' });
    });

    it('validates PATCH bodies and unknown secrets', async () => {
      const url = '/applications/production-gateway/secrets/DATABASE_PASSWORDS';
      expect((await api.patch(url, { rotationIntervalDays: 0 })).status).toBe(400);
      expect((await api.patch(url, { rotationIntervalDays: 5, clearRotationInterval: true })).status).toBe(400);
      expect((await api.patch('/applications/production-gateway/secrets/NOPE', { rotationIntervalDays: 5 })).status).toBe(404);
    });

    it('edits global secrets and reports them per environment slug', async () => {
      const res = await api.patch('/global/secrets/Sentry--Dsn', { rotationIntervalDays: 30 });
      expect(res.data.rotationIntervalDays).toBe(30);
      const items = (await api.get('/secrets/expiring', { params: { withinDays: 3650 } })).data.items as any[];
      expect(items.find((i) => i.secret === 'Sentry--Dsn')).toMatchObject({ isGlobal: true, application: null, environment: '*', reason: 'rotation' });
    });

    it('runs reminders without a webhook, like an API without RotationReminders:WebhookUrl', async () => {
      const res = await api.post('/secrets/expiring/notify');
      expect(res.data).toMatchObject({ webhookConfigured: false, sent: 0, delivered: true });
      expect(res.data.due).toBeGreaterThan(0);
    });
  });

  describe('Dashboard API', () => {
    it('returns totals, per-application and per-environment counts', async () => {
      const res = await api.get('/dashboard');
      expect(res.status).toBe(200);
      const d = res.data;
      expect(typeof d.generatedAt).toBe('string');
      expect(d.totals.applications).toBe(d.applications.length);
      expect(d.totals.environments).toBe(5);
      const gateway = d.applications.find((a: any) => a.slug === 'production-gateway');
      expect(gateway.secretCount).toBe(2);
      expect(gateway.configurationCount).toBe(3);
      expect(gateway.inheritGlobals).toBe(true);
      const prod = gateway.environments.find((e: any) => e.slug === 'production');
      expect(prod).toMatchObject({ secretCount: 2, configurationCount: 2 });
      expect(prod.lastSeenAt).not.toBeNull();
      expect(d.global.configurationCount).toBe(4);
      expect(d.global.secretCount).toBe(1);
      expect(d.featureFlags).toBeNull();
    });

    it('includes every attention kind with its severity', async () => {
      const res = await api.get('/dashboard');
      const byKind = new Map(res.data.attention.map((i: any) => [i.kind, i]));
      expect(byKind.get('secret-expired')).toMatchObject({ severity: 'error', application: 'production-gateway', environment: 'development', target: 'DATABASE_PASSWORDS' });
      expect(byKind.get('secret-no-valid-version')).toMatchObject({ severity: 'error', environment: 'production', target: 'REDIS_CACHE_TOKEN' });
      expect(byKind.get('secret-expiring')).toMatchObject({ severity: 'warning', application: 'auth-provider-security', environment: 'staging', target: 'JWT_SIGNING_SECRET' });
      expect(byKind.get('secret-rotation-due')).toMatchObject({ severity: 'warning', environment: 'production', target: 'JWT_SIGNING_SECRET' });
      expect(byKind.get('consumer-stale')).toMatchObject({ severity: 'warning', application: 'auth-provider-security', environment: 'production' });
      expect(byKind.get('consumer-never-seen')).toMatchObject({ severity: 'info', application: 'production-gateway', environment: 'development' });
      expect(byKind.get('config-empty-value')).toMatchObject({ severity: 'info', environment: 'staging', target: 'OAUTH_CALLBACK_URL' });
      expect((byKind.get('secret-expiring') as any).dueAt).toBeTruthy();
    });

    it('honours the threshold query parameters', async () => {
      const kinds = async (params: Record<string, number>) =>
        (await api.get('/dashboard', { params })).data.attention.map((i: any) => i.kind);
      expect(await kinds({ expiringWithinDays: 1 })).not.toContain('secret-expiring');
      expect(await kinds({ staleAfterDays: 30 })).not.toContain('consumer-stale');
    });

    it('reflects changes and records them as recent activity', async () => {
      await api.put('/applications/production-gateway/configurations/production/MAX_DB_CONNECTIONS', {
        value: '', description: 'x',
      });
      const res = await api.get('/dashboard');
      expect(res.data.attention).toContainEqual(
        expect.objectContaining({ kind: 'config-empty-value', application: 'production-gateway', target: 'MAX_DB_CONNECTIONS' })
      );
      expect(res.data.recentActivity[0]).toMatchObject({
        action: 'Updated configuration',
        application: 'production-gateway',
        environment: 'production',
        target: 'MAX_DB_CONNECTIONS',
        targetType: 'configuration',
      });
      expect(res.data.recentActivity.length).toBeLessThanOrEqual(20);
    });
  });
});
