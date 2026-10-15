import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { AuditContextInterceptor } from './audit-context.interceptor';
import { AuditService } from './audit.service';
import { RequestContextMiddleware } from './request-context.middleware';
import { RequestContextService } from './request-context.service';

@Module({
  providers: [
    PrismaService,
    RequestContextService,
    AuditService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditContextInterceptor,
    },
  ],
  exports: [AuditService, RequestContextService],
})
export class AuditModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Establishes the AsyncLocalStorage context before guards and handlers run.
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
