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
  describe('Configuration history API (guibranco/grimoire-api#77)', () => {
    const base = '/applications/production-gateway/configurations';

    it('starts seeded entries with a baseline and records every change', async () => {
      await api.put(`${base}/production/MAX_DB_CONNECTIONS`, { value: '150' });
      await api.put(`${base}/production/MAX_DB_CONNECTIONS`, { value: '150' }); // no change
      const history = (await api.get(`${base}/production/MAX_DB_CONNECTIONS/history`)).data as any[];
      expect(history.map((h) => [h.revision, h.change, h.value])).toEqual([
        [2, 'update', '150'],
        [1, 'baseline', '100'],
      ]);
      expect(history[1].changedBy).toBe('system');
    });

    it('records creates and deletes, and 404s keys without history', async () => {
      await api.post(base, { environmentSlug: 'staging', key: 'NEW_KEY', value: 'v1' });
      await api.delete(`${base}/staging/NEW_KEY`);
      const history = (await api.get(`${base}/staging/NEW_KEY/history`)).data as any[];
      expect(history.map((h) => [h.change, h.value])).toEqual([
        ['delete', null],
        ['create', 'v1'],
      ]);
      expect((await api.get(`${base}/staging/NEVER/history`)).status).toBe(404);
    });

    it('rolls back to an older revision, re-creating deleted keys', async () => {
      await api.put(`${base}/staging/MAX_DB_CONNECTIONS`, { value: '25' });
      const res = await api.post(`${base}/staging/MAX_DB_CONNECTIONS/rollback/1`);
      expect(res.status).toBe(200);
      expect(res.data.value).toBe('20');
      const latest = (await api.get(`${base}/staging/MAX_DB_CONNECTIONS/history`)).data[0];
      expect(latest).toMatchObject({ revision: 3, change: 'rollback', rolledBackFrom: 1, value: '20' });

      await api.delete(`${base}/production/COMPRESSION_ENABLED`);
      expect((await api.post(`${base}/production/COMPRESSION_ENABLED/rollback/2`)).status).toBe(400);
      expect((await api.post(`${base}/production/COMPRESSION_ENABLED/rollback/9`)).status).toBe(404);
      expect((await api.post(`${base}/production/COMPRESSION_ENABLED/rollback/1`)).status).toBe(200);
      const list = (await api.get(base)).data as any[];
      expect(list.some((c) => c.key === 'COMPRESSION_ENABLED' && c.environmentSlug === 'production')).toBe(true);
    });

    it('keeps history for global configuration too', async () => {
      await api.post('/global/configurations', { environmentSlug: '*', key: 'G_KEY', value: 'one' });
      await api.put('/global/configurations/*/G_KEY', { value: 'two' });
      expect((await api.post('/global/configurations/*/G_KEY/rollback/1')).data.value).toBe('one');
      const history = (await api.get('/global/configurations/*/G_KEY/history')).data as any[];
      expect(history.map((h) => h.change)).toEqual(['rollback', 'update', 'create']);
    });

    it('compares the effective configuration of two environments', async () => {
      const res = await api.get(`${base}/diff`, { params: { from: 'staging', to: 'production' } });
      const byKey = new Map((res.data.items as any[]).map((i) => [i.key, i]));
      expect(byKey.get('MAX_DB_CONNECTIONS')).toMatchObject({ status: 'changed', from: { value: '20' }, to: { value: '100' } });
      expect(byKey.get('COMPRESSION_ENABLED')).toMatchObject({ status: 'added', from: null });
      expect([...byKey.values()].every((i) => i.status !== 'unchanged')).toBe(true);

      const all = await api.get(`${base}/diff`, { params: { from: 'staging', to: 'production', includeUnchanged: true } });
      expect((all.data.items as any[]).some((i) => i.status === 'unchanged')).toBe(true);
      expect((await api.get(`${base}/diff`, { params: { from: 'staging', to: 'nope' } })).status).toBe(404);
    });

    it('rolls a secret back into a new current version without returning the value', async () => {
      const url = '/applications/auth-provider-security/secrets/JWT_SIGNING_SECRET/versions/production';
      const res = await api.post(`${url}/1/rollback`);
      expect(res.status).toBe(200);
      expect(res.data).toMatchObject({ version: 4, isCurrent: true, isEnabled: true });
      expect(res.data.value).toBeUndefined();
      expect((await api.post(`${url}/9/rollback`)).status).toBe(404);
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

  describe('Reports API (guibranco/grimoire-api#84)', () => {
    it('lists never-read secrets first, then the longest unread', async () => {
      const res = await api.get('/reports/unused-secrets');
      expect(res.status).toBe(200);
      expect(res.data.days).toBe(90);
      const items = res.data.items as any[];
      expect(items.map((i) => i.secret)).toEqual(['REDIS_CACHE_TOKEN', 'JWT_SIGNING_SECRET']);
      expect(items[0]).toMatchObject({ application: 'production-gateway', lastReadAt: null, readCount: 0, reads: [] });
      expect(items[1]).toMatchObject({ application: 'auth-provider-security', readCount: 52 });
      expect(items[1].reads[0]).toMatchObject({ environment: 'production', readCount: 52 });
      expect(items.every((i) => !('value' in i))).toBe(true);
    });

    it('applies the window and validates it', async () => {
      const names = async (days: number) =>
        ((await api.get('/reports/unused-secrets', { params: { days } })).data.items as any[]).map((i) => i.secret);
      expect(await names(5)).toEqual(['REDIS_CACHE_TOKEN', 'JWT_SIGNING_SECRET']);
      expect(await names(200)).toEqual(['REDIS_CACHE_TOKEN']);
      expect((await api.get('/reports/unused-secrets', { params: { days: 0 } })).status).toBe(400);
      expect((await api.get('/reports/unused-secrets', { params: { days: 4000 } })).status).toBe(400);
    });

    it('lists a never-read global secret with no application', async () => {
      await api.post('/global/secrets', { name: 'IDLE_GLOBAL', description: 'x' });
      const items = (await api.get('/reports/unused-secrets')).data.items as any[];
      expect(items.find((i) => i.secret === 'IDLE_GLOBAL')).toMatchObject({ isGlobal: true, application: null, applicationName: null, lastReadAt: null });
    });

    it('forgets reads of deleted secrets', async () => {
      await api.delete('/applications/auth-provider-security/secrets/JWT_SIGNING_SECRET');
      const items = (await api.get('/reports/unused-secrets')).data.items as any[];
      expect(items.some((i) => i.secret === 'JWT_SIGNING_SECRET')).toBe(false);
      const graph = (await api.get('/reports/dependencies')).data;
      expect(graph.edges.some((e: any) => e.target === 'secret:auth-provider-security/JWT_SIGNING_SECRET')).toBe(false);
    });

    it('builds the dependency graph with owns, reads, overrides and inherits', async () => {
      await api.post('/applications/production-gateway/configurations', { environmentSlug: 'production', key: 'Smtp', value: '{}' });
      const graph = (await api.get('/reports/dependencies')).data;
      const ids = graph.nodes.map((n: any) => n.id);
      expect(ids).toEqual([...ids].sort());
      expect(ids).toContain('app:production-gateway');
      expect(graph.nodes.find((n: any) => n.id === 'config:production-gateway/MAX_DB_CONNECTIONS').environments.length).toBeGreaterThan(0);
      const has = (source: string, target: string, kind: string) =>
        graph.edges.some((e: any) => e.source === source && e.target === target && e.kind === kind);
      expect(has('app:production-gateway', 'secret:production-gateway/DATABASE_PASSWORDS', 'owns')).toBe(true);
      expect(has('config:production-gateway/Smtp', 'global-config:Smtp', 'overrides')).toBe(true);
      expect(has('app:production-gateway', 'global-config:Smtp', 'inherits')).toBe(false);
      expect(has('app:auth-provider-security', 'global-config:Smtp', 'inherits')).toBe(true);
      const read = graph.edges.find((e: any) => e.source === 'app:production-gateway' && e.target === 'secret:production-gateway/DATABASE_PASSWORDS' && e.kind === 'reads');
      expect(read).toMatchObject({ environments: ['production', 'staging'], readCount: 19343 });
    });

    it('marks an application secret that shadows a global as overriding it', async () => {
      await api.post('/applications/production-gateway/secrets', { name: 'Sentry--Dsn', description: 'own' });
      const graph = (await api.get('/reports/dependencies')).data;
      expect(
        graph.edges.some((e: any) => e.source === 'secret:production-gateway/Sentry--Dsn' && e.target === 'global-secret:Sentry--Dsn' && e.kind === 'overrides')
      ).toBe(true);
    });
  });

  describe('Feature flags API (guibranco/grimoire-api#90)', () => {
    const base = '/applications/production-gateway/feature-flags';

    it('lists the demo flags with a state per environment, filtered by tag and state', async () => {
      const res = await api.get(base);
      expect(res.status).toBe(200);
      expect(res.data.map((f: any) => f.key)).toEqual(['beta-dashboard', 'checkout-redesign', 'email-provider', 'new-pdf-parser']);
      expect(res.data[0].environments.map((e: any) => e.environment)).toEqual(['production', 'staging', 'development']);
      expect((await api.get(base, { params: { tag: 'q4' } })).data.map((f: any) => f.key)).toEqual(['checkout-redesign']);
      const offInProd = await api.get(`${base}?environment=production&enabled=false`);
      expect(offInProd.data.map((f: any) => f.key)).toEqual(['email-provider', 'new-pdf-parser']);
      expect((await api.get(`${base}?environment=nope`)).status).toBe(404);
      expect((await api.get('/applications/nope/feature-flags')).status).toBe(404);
    });

    it('creates, edits and deletes flags, keeping the history', async () => {
      const created = await api.post(base, { key: 'pay-later', tags: ['b', 'a', 'b'] });
      expect(created.status).toBe(201);
      expect(created.data).toMatchObject({ type: 'boolean', defaultVariant: 'off', tags: ['a', 'b'] });
      expect(created.data.environments.every((e: any) => !e.enabled && e.version === 0)).toBe(true);
      expect((await api.post(base, { key: 'pay-later' })).status).toBe(409);
      expect((await api.post(base, { key: 'bad key' })).status).toBe(400);
      expect((await api.post(base, { key: 'x', type: 'multivariate', variants: [{ key: 'a', value: 1 }] })).status).toBe(400);
      expect((await api.post(base, { key: 'x', variants: [{ key: 'a', value: 1 }, { key: 'b', value: 1 }] })).status).toBe(400);
      expect((await api.post(base, { key: 'x', defaultVariant: 'maybe' })).status).toBe(400);

      const edited = await api.put(`${base}/pay-later`, { description: 'BNPL', defaultVariant: 'on' });
      expect(edited.data).toMatchObject({ description: 'BNPL', defaultVariant: 'on' });
      expect((await api.put(`${base}/pay-later`, { variants: [{ key: 'a', value: 1 }, { key: 'b', value: 2 }] })).status).toBe(400);

      expect((await api.delete(`${base}/pay-later`)).status).toBe(204);
      expect((await api.get(`${base}/pay-later`)).status).toBe(404);
      const history = (await api.get(`${base}/pay-later/history`)).data;
      expect(history.map((h: any) => h.change)).toEqual(['delete', 'update', 'create']);
      expect((await api.get(`${base}/never/history`)).status).toBe(404);
    });

    it('stores targeting per environment, validates it and keeps variants in use', async () => {
      const url = `${base}/checkout-redesign/environments/staging`;
      const good = {
        enabled: true,
        offVariant: 'control',
        rules: [{ conditions: [{ attribute: 'userId', operator: 'in', values: ['u-1'] }], serve: { variant: 'treatment' } }],
        fallthrough: { variant: 'control' },
      };
      const saved = await api.put(url, good);
      const staging = saved.data.environments.find((e: any) => e.environment === 'staging');
      expect(staging).toMatchObject({ version: 2, rules: good.rules });

      expect((await api.put(url, { enabled: true, fallthrough: { rollout: [{ variant: 'control', weight: 60 }] } })).status).toBe(400);
      expect((await api.put(url, { enabled: true, fallthrough: {} })).status).toBe(400);
      expect((await api.put(url, { enabled: true, offVariant: 'nope' })).status).toBe(400);
      expect((await api.put(url, { enabled: true, rules: [{ conditions: [], serve: { variant: 'control' } }] })).status).toBe(400);
      expect(
        (await api.put(url, { enabled: true, rules: [{ conditions: [{ attribute: 'v', operator: 'semVerGte', values: ['1.0'] }], serve: { variant: 'control' } }] })).status
      ).toBe(400);
      expect((await api.put(`${base}/checkout-redesign/environments/nope`, good)).status).toBe(404);

      const drop = await api.put(`${base}/checkout-redesign`, { variants: [{ key: 'control', value: 1 }, { key: 'other', value: 2 }] });
      expect(drop.status).toBe(400);
      expect(JSON.stringify(drop.data)).toContain('treatment');
    });

    it('toggles, recording the change in the activity feed', async () => {
      const url = `${base}/new-pdf-parser/environments/production/toggle`;
      const on = await api.post(url);
      expect(on.data.environments.find((e: any) => e.environment === 'production')).toMatchObject({ enabled: true, version: 1 });
      const off = await api.post(url, { enabled: false });
      expect(off.data.environments.find((e: any) => e.environment === 'production').enabled).toBe(false);
      const history = (await api.get(`${base}/new-pdf-parser/history`)).data;
      expect(history[0]).toMatchObject({ change: 'toggle', environment: 'production', before: { enabled: true }, after: { enabled: false } });
      const audit = (await api.get('/audit', { params: { application: 'production-gateway' } })).data;
      expect(audit.items[0]).toMatchObject({ action: 'feature-flag.toggle', target: 'new-pdf-parser', environment: 'production' });
    });

    it('evaluates with the shared-spec evaluator', async () => {
      const url = `${base}/beta-dashboard/evaluate`;
      const rule = await api.post(url, { environment: 'production', context: { userId: 'u-123' } });
      expect(rule.data).toMatchObject({ variant: 'on', value: true, reason: 'RULE_MATCH', matchedRuleIndex: 0, bucket: null });
      const semver = await api.post(url, { environment: 'production', context: { appVersion: '3.1.0' } });
      expect(semver.data).toMatchObject({ variant: 'on', matchedRuleIndex: 2 });
      const fallthrough = await api.post(url, { environment: 'production', context: { userId: 'u-9' } });
      expect(fallthrough.data).toMatchObject({ variant: 'off', reason: 'FALLTHROUGH' });
      const off = await api.post(`${base}/new-pdf-parser/evaluate`, { environment: 'production' });
      expect(off.data).toMatchObject({ variant: 'off', reason: 'OFF', value: false });
      expect((await api.post(url, { environment: 'nope' })).status).toBe(404);
      expect((await api.post(url, {})).status).toBe(400);
      expect((await api.post(`${base}/nope/evaluate`, { environment: 'production' })).status).toBe(404);
    });

    it('leaves unrelated and malformed routes to the other handlers', async () => {
      const res = await api.get('/applications/demo%/configurations');
      expect(res.status).not.toBe(500);
      expect((await api.get('/applications/production-gateway/feature-flags/beta-dashboard/bogus')).status).toBe(404);
      expect((await api.get('/applications/production-gateway/feature-flags/%E0%A4%A')).status).toBe(404);
      expect((await api.get(`${base}/beta-dashboard`)).data.key).toBe('beta-dashboard');
    });

    it('drops an application\'s flags with the application', async () => {
      await api.delete('/applications/production-gateway');
      await api.post('/applications', { name: 'Production Gateway' });
      const list = await api.get(base);
      expect(list.status === 404 || list.data.length === 0).toBe(true);
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
