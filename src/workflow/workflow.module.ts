import { forwardRef, Module } from '@nestjs/common';
import { DocumentModule } from '../document/document.module';
import { DirectoryModule } from '../directory/directory.module';
import { AuthorizationService } from '../auth/compatibility/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { WorkflowPolicyService } from './workflow-policy.service';
import { WorkflowEvents } from './workflow-events';

@Module({
  imports: [forwardRef(() => DocumentModule), DirectoryModule],
  controllers: [WorkflowController],
  providers: [WorkflowService, WorkflowPolicyService, WorkflowEvents, PrismaService, AuthorizationService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
