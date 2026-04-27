import { Test, TestingModule } from '@nestjs/testing';
import { CategoryService } from './category.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CategoryService', () => {
  let service: CategoryService;
  let prisma: PrismaService;

  const mockPrismaService = {
    category: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CategoryService>(CategoryService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a category with role relations when roleIds are provided', async () => {
      mockPrismaService.category.findUnique.mockResolvedValue(null);
      mockPrismaService.category.create.mockResolvedValue({ id: 1, name: 'Test' });

      await service.create({
        name: 'Test',
        roleIds: ['uuid-1', 'uuid-2'],
      });

      expect(mockPrismaService.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            name: 'Test',
            categoryRoles: {
              create: [
                { roleId: 'uuid-1' },
                { roleId: 'uuid-2' },
              ],
            },
          },
        })
      );
    });

    it('should create a category without role relations when roleIds are not provided', async () => {
      mockPrismaService.category.findUnique.mockResolvedValue(null);
      mockPrismaService.category.create.mockResolvedValue({ id: 1, name: 'Test' });

      await service.create({
        name: 'Test',
      });

      expect(mockPrismaService.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { name: 'Test' },
        })
      );
    });
  });

  describe('update', () => {
    it('should update a category and replace its role relations when roleIds are provided', async () => {
      mockPrismaService.category.findUnique.mockResolvedValue({ id: 1, name: 'Test', _count: { documents: 0 } });
      mockPrismaService.category.update.mockResolvedValue({ id: 1, name: 'Test' });

      await service.update(1, {
        roleIds: ['uuid-3'],
      });

      expect(mockPrismaService.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: {
            categoryRoles: {
              deleteMany: {},
              create: [{ roleId: 'uuid-3' }],
            },
          },
        })
      );
    });

    it('should update a category and clear its role relations when an empty roleIds array is provided', async () => {
      mockPrismaService.category.findUnique.mockResolvedValue({ id: 1, name: 'Test', _count: { documents: 0 } });
      mockPrismaService.category.update.mockResolvedValue({ id: 1, name: 'Test' });

      await service.update(1, {
        roleIds: [],
      });

      expect(mockPrismaService.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: {
            categoryRoles: {
              deleteMany: {},
            },
          },
        })
      );
    });

    it('should update a category without touching role relations when roleIds is undefined', async () => {
      mockPrismaService.category.findUnique.mockResolvedValue({ id: 1, name: 'Test', _count: { documents: 0 } });
      mockPrismaService.category.update.mockResolvedValue({ id: 1, name: 'Test Update' });

      await service.update(1, {
        name: 'Test Update',
      });

      expect(mockPrismaService.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: { name: 'Test Update' },
        })
      );
    });
  });
});