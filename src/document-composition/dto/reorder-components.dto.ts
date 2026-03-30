import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, Min, ValidateNested } from 'class-validator';

class ReorderItemDto {
  @IsInt()
  @Type(() => Number)
  childId: number;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  order: number;
}

export class ReorderComponentsDto {
  @ApiProperty({ type: [ReorderItemDto], description: 'Array con el nuevo orden de cada componente' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items: ReorderItemDto[];
}
