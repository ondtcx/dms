import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class SearchSharingRecipientsDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(2, 100)
  query!: string;
}
