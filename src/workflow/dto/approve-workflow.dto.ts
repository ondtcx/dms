import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, IsOptional } from 'class-validator';
import { ApprovalAction } from '../approval-action.enum';

export class ApproveWorkflowDto {
  @ApiProperty({
    description: 'Acción a realizar',
    enum: ApprovalAction,
    example: ApprovalAction.APPROVED,
  })
  @IsEnum(ApprovalAction)
  action: ApprovalAction;

  @ApiPropertyOptional({
    description: 'Comentario sobre la acción',
    example: 'Documento aprobado sin observaciones',
  })
  @IsString()
  @IsOptional()
  comment?: string;
}
