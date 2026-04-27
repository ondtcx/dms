import { PrismaClient } from '@prisma/client';

type LegacyCategoryRow = {
  id: number;
  allowedRoles?: unknown;
};

type LegacyWorkflowTemplateRow = {
  id: number;
  allowedInitiatorRoles?: unknown;
  stateDefinitions?: unknown;
};

type LegacyStateDefinition = {
  state: string;
  role?: string;
  order?: number;
  requiresComment?: boolean;
};

type MigrationLogger = Pick<Console, 'log' | 'warn' | 'error'>;

export type MigrationSummary = {
  categoriesMigrated: number;
  workflowTemplatesMigrated: number;
  categoryRelationsCreated: number;
  initiatorRelationsCreated: number;
  stateRelationsCreated: number;
  warnings: number;
};

const prisma = new PrismaClient();

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toLegacyStateDefinitions(value: unknown): LegacyStateDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is LegacyStateDefinition =>
      !!item &&
      typeof item === 'object' &&
      typeof (item as LegacyStateDefinition).state === 'string',
  );
}

async function queryLegacyCategories(
  prismaClient: PrismaClient,
  logger: MigrationLogger,
): Promise<LegacyCategoryRow[]> {
  try {
    return (await prismaClient.$queryRawUnsafe(
      'SELECT id, "allowedRoles" FROM "Category"',
    )) as LegacyCategoryRow[];
  } catch (error: any) {
    logger.warn(
      `Skipping legacy Category extraction: ${error?.message ?? 'unknown error'}`,
    );
    return [];
  }
}

async function queryLegacyWorkflowTemplates(
  prismaClient: PrismaClient,
  logger: MigrationLogger,
): Promise<LegacyWorkflowTemplateRow[]> {
  try {
    return (await prismaClient.$queryRawUnsafe(
      'SELECT id, "allowedInitiatorRoles", "stateDefinitions" FROM "WorkflowTemplate"',
    )) as LegacyWorkflowTemplateRow[];
  } catch (error: any) {
    logger.warn(
      `Skipping legacy WorkflowTemplate extraction: ${error?.message ?? 'unknown error'}`,
    );
    return [];
  }
}

export async function migrateRolesToRelations(
  prismaClient: PrismaClient,
  logger: MigrationLogger = console,
): Promise<MigrationSummary> {
  logger.log('Starting data migration: Roles to Relations...');

  const roles = await prismaClient.role.findMany({
    select: {
      id: true,
      name: true,
    },
  });
  const roleNameToId = new Map<string, string>();
  for (const role of roles) {
    roleNameToId.set(role.name.toUpperCase(), role.id);
  }

  const summary: MigrationSummary = {
    categoriesMigrated: 0,
    workflowTemplatesMigrated: 0,
    categoryRelationsCreated: 0,
    initiatorRelationsCreated: 0,
    stateRelationsCreated: 0,
    warnings: 0,
  };

  const categories = await queryLegacyCategories(prismaClient, logger);
  for (const category of categories) {
    const allowedRoles = toStringArray(category.allowedRoles);
    for (const roleName of allowedRoles) {
      const roleId = roleNameToId.get(roleName.toUpperCase());
      if (!roleId) {
        summary.warnings += 1;
        logger.warn(
          `[WARNING] Category ${category.id}: Unmapped role name "${roleName}"`,
        );
        continue;
      }

      await prismaClient.categoryRole.upsert({
        where: {
          categoryId_roleId: {
            categoryId: category.id,
            roleId,
          },
        },
        update: {},
        create: {
          categoryId: category.id,
          roleId,
        },
      });
      summary.categoryRelationsCreated += 1;
    }

    summary.categoriesMigrated += 1;
  }

  const templates = await queryLegacyWorkflowTemplates(prismaClient, logger);
  for (const template of templates) {
    const initiatorRoles = toStringArray(template.allowedInitiatorRoles);
    for (const roleName of initiatorRoles) {
      const roleId = roleNameToId.get(roleName.toUpperCase());
      if (!roleId) {
        summary.warnings += 1;
        logger.warn(
          `[WARNING] WorkflowTemplate ${template.id} initiator: Unmapped role name "${roleName}"`,
        );
        continue;
      }

      await prismaClient.workflowTemplateInitiatorRole.upsert({
        where: {
          workflowTemplateId_roleId: {
            workflowTemplateId: template.id,
            roleId,
          },
        },
        update: {},
        create: {
          workflowTemplateId: template.id,
          roleId,
        },
      });
      summary.initiatorRelationsCreated += 1;
    }

    const stateDefinitions = toLegacyStateDefinitions(template.stateDefinitions);
    for (const stateDef of stateDefinitions) {
      const roleName = stateDef.role;
      const roleId = roleName
        ? roleNameToId.get(String(roleName).toUpperCase())
        : null;

      if (!roleId) {
        summary.warnings += 1;
        logger.warn(
          `[WARNING] WorkflowTemplate ${template.id} state "${stateDef.state}": Unmapped role name "${roleName}"`,
        );
        continue;
      }

      await prismaClient.workflowTemplateState.upsert({
        where: {
          workflowTemplateId_state: {
            workflowTemplateId: template.id,
            state: stateDef.state,
          },
        },
        update: {
          order: stateDef.order || 0,
          requiresComment: stateDef.requiresComment || false,
          roleId,
        },
        create: {
          workflowTemplateId: template.id,
          state: stateDef.state,
          roleId,
          order: stateDef.order || 0,
          requiresComment: stateDef.requiresComment || false,
        },
      });
      summary.stateRelationsCreated += 1;
    }

    summary.workflowTemplatesMigrated += 1;
  }

  logger.log(`Migration completed. Warnings: ${summary.warnings}`);
  return summary;
}

async function main() {
  try {
    const summary = await migrateRolesToRelations(prisma, console);
    console.log('Migration summary:', summary);
  } catch (error) {
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
