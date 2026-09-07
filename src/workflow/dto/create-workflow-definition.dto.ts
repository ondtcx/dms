import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class WorkflowStageDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  order: number;

  @ApiProperty({ example: 'coordinador' })
  @IsString()
  @IsNotEmpty()
  roleKey: string;
}

export class CreateWorkflowDefinitionDto {
  @ApiProperty({ example: 'Aprobación académica' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Flujo secuencial para documentos académicos' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  categoryId?: number;

  @ApiProperty({ type: [WorkflowStageDto] })
  @IsArray()
  stages: WorkflowStageDto[];

  @ApiPropertyOptional({ type: [String], example: ['profesor', 'coordinador'] })
  @IsArray()
  @IsOptional()
  allowedInitiatorRoles?: string[];

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
