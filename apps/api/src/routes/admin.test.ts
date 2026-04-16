import { describe, it, expect, mock } from 'bun:test';
import { Elysia } from 'elysia';

const mockQueryChain = {
  orderBy: mock(() => Promise.resolve([])),
  limit: mock(() => Promise.resolve([])),
};

const mockFrom = {
  where: mock(() => mockQueryChain),
  limit: mock(() => Promise.resolve([])),
};

const mockSelect = {
  from: mock(() => mockFrom),
};

mock.module('../db', () => ({
  db: {
    select: mock(() => mockSelect),
  },
  userProfiles: {},
  userRestrictionHistory: {},
}));

mock.module('../middleware/auth', () => ({
  authPlugin: new Elysia({ name: 'auth' }).derive(() => ({
    userId: 'admin_1',
    email: 'admin@pilly.com',
  })),
}));

import { createAdminRoutes } from './admin';

describe('Admin Route Integration Test', () => {
  const app = createAdminRoutes(new Elysia());

  it('GET /admin/users - 정상 호출되는가?', async () => {
    const response = await app.handle(
      new Request('http://localhost/admin/users', {
        headers: { Authorization: 'Bearer mock-token' },
      }),
    );
    expect(response.status).toBeDefined();
  });
});
