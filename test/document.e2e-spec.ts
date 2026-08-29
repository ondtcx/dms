import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('DocumentController (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let jwtToken: string;
  let jwtService: JwtService;

  beforeAll(async () => {
    const mockPrismaService = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user123', role: 'admin' }),
      },
      category: {
        findUnique: jest.fn(),
      },
      directory: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ id: 7, createdById: 'user123' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      document: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      userDirectoryUsage: { findMany: jest.fn().mockResolvedValue([]) },
      directoryNavigationEvent: { findUnique: jest.fn(), create: jest.fn() },
      $transaction: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    (mockPrismaService.$transaction as jest.Mock).mockImplementation(async (callback: any) => callback(mockPrismaService));
    await app.init();
    
    prismaService = moduleFixture.get<PrismaService>(PrismaService);
    jwtService = moduleFixture.get<JwtService>(JwtService);
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

  it('accepts a claimless legacy JWT and resolves the current user projection', async () => {
    const legacyToken = jwtService.sign({ sub: 'user123', role: 'admin' });

    await request(app.getHttpServer())
      .get('/documents')
      .set('Authorization', `Bearer ${legacyToken}`)
      .expect(200);

    expect(prismaService.user.findUnique).toHaveBeenCalled();
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

  it('filters an authorized directory without bypassing the document query', async () => {
    await request(app.getHttpServer())
      .get('/documents?directoryId=7')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    const query = (prismaService.document.findMany as jest.Mock).mock.calls.at(-1)[0];
    expect(query.where.AND).toEqual(expect.arrayContaining([{ directoryId: 7 }]));
  });

  it('conceals a directory that is not discoverable', async () => {
    (prismaService.directory.findUnique as jest.Mock).mockResolvedValueOnce(null);

    await request(app.getHttpServer())
      .get('/documents?directoryId=7')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(404);
  });

  it('hides an unrelated directory from directory listing', async () => {
    (prismaService.user.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'user123',
      role: 'user',
    });
    (prismaService.document.findMany as jest.Mock).mockResolvedValueOnce([]);
    (prismaService.directory.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockImplementationOnce((query) =>
        Promise.resolve(
          query.where.id.in.includes(9)
            ? [{ id: 9, name: 'Protected', parentId: null, createdById: 'other-user' }]
            : [],
        ),
      );

    const response = await request(app.getHttpServer())
      .get('/directories')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    expect(response.body).toEqual([]);
    expect(response.body).not.toContainEqual(expect.objectContaining({ id: 9 }));
  });

  it('returns the complete breadcrumb without changing logical placement', async () => {
    (prismaService.directory.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 7, createdById: 'user123', parentId: 3 })
      .mockResolvedValueOnce({ id: 7, name: 'Annual', parentId: 3 })
      .mockResolvedValueOnce({ id: 3, name: 'Policies', parentId: null });

    const response = await request(app.getHttpServer())
      .get('/directories/7/breadcrumb')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    expect(response.body.map((directory: any) => directory.name)).toEqual(['Policies', 'Annual']);
    expect(prismaService.directory.findUnique).toHaveBeenLastCalledWith({
      where: { id: 3 },
      select: { id: true, name: true, parentId: true },
    });
    expect(prismaService.directory.create).not.toHaveBeenCalled();
    expect(prismaService.directory.update).not.toHaveBeenCalled();
    expect(prismaService.directory.delete).not.toHaveBeenCalled();
  });

  it('preserves document version paths while retaining the access-safe detail route', async () => {
    jest.spyOn(prismaService.document, 'findFirst').mockResolvedValueOnce({
      id: 1,
      uploadedById: 'user123',
      versions: [{ filename: 'test.pdf', path: '/files/active/original.pdf' }],
    } as any);

    const response = await request(app.getHttpServer())
      .get('/documents/1')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    expect(response.body.versions[0].path).toBe('/files/active/original.pdf');
  });

  it('filters the logical root to unassigned documents', async () => {
    await request(app.getHttpServer())
      .get('/documents?directoryId=null')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    const query = (prismaService.document.findMany as jest.Mock).mock.calls.at(-1)[0];
    expect(query.where.AND).toEqual(expect.arrayContaining([{ directoryId: null }]));
  });

  it('returns a validation error when a move destination is missing', async () => {
    await request(app.getHttpServer())
      .patch('/documents/1/directory')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({})
      .expect(400);
  });

  it('requires authentication for navigation APIs', async () => {
    await request(app.getHttpServer()).get('/directories/summary').expect(401);
    await request(app.getHttpServer()).get('/directories/accessible').expect(401);
    await request(app.getHttpServer()).post('/directories/7/visits').send({ eventId: 'bad' }).expect(401);
  });

  it('validates accessible-directory pagination and visit UUIDs', async () => {
    await request(app.getHttpServer())
      .get('/directories/accessible?page=0&limit=101')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .post('/directories/7/visits')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ eventId: 'not-a-uuid' })
      .expect(400);
  });

  it('omits hidden accessible rows and does not write concealed visits', async () => {
    (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user123',
      role: 'user',
      email: 'test@example.com',
      name: 'Test',
      authRevision: 0,
    });
    (prismaService.document.findMany as jest.Mock).mockResolvedValue([]);
    (prismaService.directory.findMany as jest.Mock).mockResolvedValue([]);
    (prismaService.directory.findUnique as jest.Mock).mockResolvedValue(null);

    const accessible = await request(app.getHttpServer())
      .get('/directories/accessible')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(accessible.body.data).toEqual([]);

    await request(app.getHttpServer())
      .post('/directories/7/visits')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ eventId: '2f6d5f2a-4b4b-4cf1-9e8d-1b0d8f7d5f12' })
      .expect(404);
    expect((prismaService.directoryNavigationEvent.create as jest.Mock)).not.toHaveBeenCalled();
  });

  it('former department endpoints are absent', async () => {
    await request(app.getHttpServer()).get('/departments').expect(404);
  });
});
