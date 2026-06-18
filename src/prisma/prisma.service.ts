import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    this.validateDatabaseUrl();

    try {
      await this.$connect();
    } catch (error) {
      this.logger.error(`Database connection failed: ${(error as Error).message}`);
      this.logger.error('Please verify DATABASE_URL and that PostgreSQL is running');
      process.exit(1);
    }
  }

  private validateDatabaseUrl(): void {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      this.logger.error('DATABASE_URL is not defined');
      process.exit(1);
    }

    try {
      const url = new URL(databaseUrl);

      // Check for unencoded special characters in the password segment.
      // The password sits between the first ':' after '://' and the last '@'.
      const schemeEnd = databaseUrl.indexOf('://') + 3;
      const lastAtIndex = databaseUrl.lastIndexOf('@');

      if (lastAtIndex > schemeEnd) {
        const credentials = databaseUrl.substring(schemeEnd, lastAtIndex);
        const colonIndex = credentials.indexOf(':');

        if (colonIndex !== -1) {
          const rawPassword = credentials.substring(colonIndex + 1);

          const unencodedChars = ['@', '#', '?', ' ', '[', ']', '{', '}', '|', '\\', '^', '`', '<', '>', '"', "'"];
          const foundUnencoded = unencodedChars.filter((char) => rawPassword.includes(char));

          if (foundUnencoded.length > 0) {
            this.logger.error(
              `DATABASE_URL contains unencoded special characters in password: ${foundUnencoded.join(', ')}. ` +
                'Special characters must be URL-encoded (e.g., @ → %40, # → %23). ' +
                `Current password portion: "${rawPassword.substring(0, 3)}..." (truncated for security)`,
            );
            process.exit(1);
          }
        }
      }
    } catch (error) {
      this.logger.error(`DATABASE_URL parse error: ${(error as Error).message}`);
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
