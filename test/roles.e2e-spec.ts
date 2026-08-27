import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Roles lifecycle (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
    await app.init();
  });

  afterAll(() => app?.close());

  it('exposes the role lifecycle endpoint', async () => {
    await request(app.getHttpServer()).get('/roles').expect((response) => {
      expect([401, 403, 200]).toContain(response.status);
    });
  });
});
