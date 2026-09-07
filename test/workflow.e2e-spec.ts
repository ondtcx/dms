import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const hasDatabase = Boolean(process.env.DATABASE_URL);
(hasDatabase ? describe : describe.skip)('Workflow protected endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.WORKFLOW_FEATURE_ENABLED = 'true';
    const moduleBuilder = Test.createTestingModule({ imports: [AppModule] });
    const moduleFixture = await moduleBuilder.compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it.each([
    ['GET', '/workflow-definitions'],
    ['POST', '/workflow-definitions'],
    ['GET', '/documents/1/workflows'],
    ['POST', '/documents/1/workflows'],
    ['POST', '/workflows/1/transitions'],
    ['POST', '/workflows/1/assignments/1/reassign'],
  ])('%s %s enforces the authentication boundary or rollout gate', async (method, path) => {
    const response = await request(app.getHttpServer())[(method.toLowerCase() as 'get' | 'post')](path);

    expect(response.status).toBe(401);
  });

  afterAll(async () => {
    await app?.close();
  });
});
