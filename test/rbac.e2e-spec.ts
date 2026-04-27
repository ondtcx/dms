import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { RoleService } from '../src/role/role.service';

describe('RBAC (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let jwtToken: string;
  let roleService: RoleService;

  beforeAll(async () => {
    const mockPrismaService = {
      role: {
        findUnique: jest.fn(),
      },
      category: {
        create: jest.fn().mockResolvedValue({ id: 1, name: 'New Category' }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user123', roleId: 'role1' }),
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prismaService = app.get<PrismaService>(PrismaService);
    roleService = app.get<RoleService>(RoleService);
    const jwtService = app.get<JwtService>(JwtService);
    
    // Create token with roleId for the PermissionsGuard to use
    jwtToken = jwtService.sign({ sub: 'user123', email: 'test@example.com', roleId: 'role1' });
  });

  beforeEach(() => {
    // Clear cache before each test to ensure fresh DB lookups
    roleService.clearCache();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should allow access to protected route if user has required permissions (201 Created)', async () => {
    // Mock the DB to return a role with the required 'role:admin' permission
    jest.spyOn(prismaService.role, 'findUnique').mockResolvedValue({
      id: 'role1',
      name: 'Admin Role',
      permissions: [{ id: 1, action: 'role:admin' }]
    } as any);

    const response = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ name: 'New Category' });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id', 1);
    expect(prismaService.role.findUnique).toHaveBeenCalledTimes(1);
  });

  it('should deny access to protected route if user lacks required permissions (403 Forbidden)', async () => {
    // Mock the DB to return a role WITHOUT the required 'role:admin' permission
    jest.spyOn(prismaService.role, 'findUnique').mockResolvedValue({
      id: 'role1',
      name: 'Basic Role',
      permissions: [{ id: 2, action: 'document:read' }]
    } as any);

    const response = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ name: 'New Category' });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Forbidden resource');
  });
});