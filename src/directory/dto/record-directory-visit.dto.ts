import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RecordDirectoryVisitDto {
  @ApiProperty({ format: 'uuid', example: '2f6d5f2a-4b4b-4cf1-9e8d-1b0d8f7d5f12' })
  @IsUUID()
  eventId: string;
}
