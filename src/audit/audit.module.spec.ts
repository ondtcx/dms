import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { AuditModule } from './audit.module';
import { RequestContextService } from './request-context.service';

@Controller('audit-probe')
class AuditProbeController {
  constructor(private readonly context: RequestContextService) {}

  @Get()
  read() {
    return this.context.snapshot();
  }
}

describe('AuditModule wiring', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuditModule],
      controllers: [AuditProbeController],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('applies the request context middleware to routes outside the module', async () => {
    const response = await request(app.getHttpServer())
      .get('/audit-probe')
      .set('x-request-id', 'probe-1')
      .set('user-agent', 'probe-agent');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      requestId: 'probe-1',
      userAgent: 'probe-agent',
    });
  });
});
