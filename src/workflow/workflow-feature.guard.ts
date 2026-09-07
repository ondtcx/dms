import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isWorkflowFeatureEnabled } from '../config/workflow-feature.config';

@Injectable()
export class WorkflowFeatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(_context: ExecutionContext): boolean {
    if (process.env.WORKFLOW_FEATURE_ENABLED !== undefined) {
      if (isWorkflowFeatureEnabled(process.env.WORKFLOW_FEATURE_ENABLED)) return true;
      throw new NotFoundException('Workflow routes are disabled');
    }
    const configured = this.config.get<boolean | string>('workflowFeatureEnabled');
    const environment = process.env.WORKFLOW_FEATURE_ENABLED ?? this.config.get<string>('WORKFLOW_FEATURE_ENABLED');
    if (
      configured === true ||
      isWorkflowFeatureEnabled(configured) ||
      isWorkflowFeatureEnabled(environment)
    ) {
      return true;
    }
    throw new NotFoundException('Workflow routes are disabled');
  }
}
