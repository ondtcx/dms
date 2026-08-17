import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('DocumentController (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let jwtToken: string;

  beforeAll(async () => {
    const mockPrismaService = {
      document: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user123', role: 'admin' }),
      },
      category: {
        findUnique: jest.fn(),
      }
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    
    prismaService = moduleFixture.get<PrismaService>(PrismaService);
    const jwtService = moduleFixture.get<JwtService>(JwtService);
    jwtToken = jwtService.sign({ sub: 'user123', email: 'test@example.com', role: 'admin' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('/documents (GET)', async () => {
    // Mock prisma response to simulate the new nested structure
    jest.spyOn(prismaService.document, 'findMany').mockResolvedValue([
      {
        id: 1,
        description: 'Test Document',
        categoryId: 1,
        documentTypeId: 1,
        isPublic: false,
        uploadedById: 'user123',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        status: 'BORRADOR',
        isComposite: false,
        academic: {
          id: 1,
          documentId: 1,
          courseId: 10,
          subjectId: null,
          academicYearId: 2,
        },
        search: null,
        templateData: null,
        versions: [
          {
            id: 1,
            documentId: 1,
            version: 1,
            filename: 'test.pdf',
            mimetype: 'application/pdf',
            size: 1024,
            path: '/path/test.pdf',
            checksumSHA256: null,
            storedName: 'stored.pdf',
            createdAt: new Date(),
          }
        ]
      } as any
    ]);

    jest.spyOn(prismaService.document, 'count').mockResolvedValue(1);

    const response = await request(app.getHttpServer())
      .get('/documents')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toBeInstanceOf(Array);
    expect(response.body.data.length).toBe(1);
    expect(response.body.data[0]).toHaveProperty('academic');
    expect(response.body.data[0].academic).toHaveProperty('courseId', 10);
    expect(response.body.data[0]).toHaveProperty('versions');
    expect(response.body.data[0].versions[0]).toHaveProperty('filename', 'test.pdf');
  });

  it('/documents/:id (GET)', async () => {
    jest.spyOn(prismaService.document, 'findFirst').mockResolvedValue({
      id: 1,
      description: 'Test Document 1',
      academic: {
        id: 1,
        courseId: 10,
      },
      versions: [
        {
          id: 1,
          filename: 'test.pdf',
        }
      ]
    } as any);

    const response = await request(app.getHttpServer())
      .get('/documents/1')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('academic');
    expect(response.body.academic).toHaveProperty('courseId', 10);
    expect(response.body).toHaveProperty('versions');
    expect(response.body.versions[0]).toHaveProperty('filename', 'test.pdf');
  });

  it('former department endpoints are absent', async () => {
    await request(app.getHttpServer()).get('/departments').expect(404);
  });
});
