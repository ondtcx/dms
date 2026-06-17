import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    this.validateDatabaseUrl();
    await this.$connect();
  }

  private validateDatabaseUrl(): void {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      this.logger.error('DATABASE_URL environment variable is not set');
      process.exit(1);
    }

    try {
      new URL(databaseUrl);
    } catch (error) {
      this.logger.error(
        `DATABASE_URL parse error — special characters in the password must be URL-encoded (e.g., @ → %40). Original error: ${(error as Error).message}`,
      );
      this.logger.error(
        'Fix: Replace unencoded special characters in your database password with their percent-encoded equivalents.',
      );
      this.logger.error(
        'Example: postgresql://postgres:pass%40word@localhost:5432/dms?schema=public',
      );
      process.exit(1);
    }
  }
}
