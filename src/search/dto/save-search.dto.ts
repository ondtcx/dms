import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsObject } from 'class-validator';

export class SaveSearchDto {
  @ApiProperty({ description: 'Nombre de la búsqueda guardada', example: 'Documentos recientes del departamento' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Criterios de búsqueda guardados', example: { query: 'acta', categoryIds: [1] } })
  @IsObject()
  @IsNotEmpty()
  filters: Record<string, any>;
}
