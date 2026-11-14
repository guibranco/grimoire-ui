import { describe, it, expect, beforeEach } from 'vitest';
import { api, fetchApiVersion, getApiConnectionInfo, UI_VERSION } from '../src/lib/api';
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
      expect(res.data).toHaveProperty('apiKey');
      expect(res.data.apiKey.startsWith('grm_')).toBe(true);

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
      expect(res.data).toHaveProperty('message');
      expect(res.data).toHaveProperty('apiKey');
      expect(res.data).toHaveProperty('key');
      expect(res.data.apiKey).toBe(res.data.key);
      expect(res.data.key.startsWith('grm_')).toBe(true);
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

    it('should define a new secret', async () => {
      const secretData = { name: 'STRIPE_API_KEY', description: 'Stripe webhook security signature client.' };
      const res = await api.post('/applications/production-gateway/secrets', secretData);
      expect(res.status).toBe(201);
      expect(res.data).toHaveProperty('name', 'STRIPE_API_KEY');
      expect(res.data.values).toEqual([]);

      // Verify in secrets list
      const listRes = await api.get('/applications/production-gateway/secrets');
      const found = listRes.data.find((s: any) => s.name === 'STRIPE_API_KEY');
      expect(found).toBeDefined();
    });

    it('should create values and increment versions for a secret', async () => {
      const valData = [
        { environmentSlug: 'production', isEnabled: true, value: 'prod_pass_123', expiresAt: null, notBefore: null },
        { environmentSlug: 'staging', isEnabled: false, value: 'stage_pass_123', expiresAt: null, notBefore: null }
      ];

      const res = await api.post('/applications/production-gateway/secrets/DATABASE_PASSWORDS/values', valData);
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('name', 'DATABASE_PASSWORDS');
      expect(res.data.values.length).toBeGreaterThanOrEqual(2);

      const prodVal = res.data.values.find((v: any) => v.environmentSlug === 'production');
      expect(prodVal.isEnabled).toBe(true);
      // DATABASE_PASSWORDS version started at 1 by default, updating it should increment to 2
      expect(prodVal.version).toBe(2);

      const stageVal = res.data.values.find((v: any) => v.environmentSlug === 'staging');
      expect(stageVal.isEnabled).toBe(false);
      // DATABASE_PASSWORDS staging value started at version 2, updating it should increment to 3
      expect(stageVal.version).toBe(3);
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
      localStorage.setItem('grimoire_api_url', 'https://vault.example.com:8443/api/management');
      const info = getApiConnectionInfo();
      expect(info.isMock).toBe(false);
      expect(info.label).toBe('vault.example.com:8443');
    });

    it('should fetch mock API version and expose UI_VERSION', async () => {
      localStorage.setItem('grimoire_api_url', 'mock://');
      const apiVersion = await fetchApiVersion();
      expect(apiVersion).toBe('2.4.0-mock');
      expect(UI_VERSION).toBeTruthy();
    });
  });
});
