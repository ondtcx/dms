import { forwardRef, Module } from '@nestjs/common';
import { DocumentModule } from '../document/document.module';
import { AuthorizationService } from '../auth/compatibility/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { WorkflowPolicyService } from './workflow-policy.service';
import { WorkflowEvents } from './workflow-events';
import { WorkflowFeatureGuard } from './workflow-feature.guard';

@Module({
  imports: [forwardRef(() => DocumentModule)],
  controllers: [WorkflowController],
  providers: [WorkflowService, WorkflowPolicyService, WorkflowEvents, WorkflowFeatureGuard, PrismaService, AuthorizationService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
