import { ApiProperty } from '@nestjs/swagger';

export class PermissionCatalogItemDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'roles.manage' })
  key: string;

  @ApiProperty({ example: 'Administrar roles' })
  label: string;

  @ApiProperty({ example: true })
  isActive: boolean;
}
