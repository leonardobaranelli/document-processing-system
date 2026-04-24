import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class StartProcessDto {
  @ApiPropertyOptional({
    description: 'Human readable name for the process.',
    example: 'Monthly contracts batch',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    description:
      'Absolute or relative path to the input directory (.txt files). ' +
      'Defaults to the configured DOCUMENTS_INPUT_DIR.',
    example: process.env.DOCUMENTS_INPUT_DIR ?? '../sample-data',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  inputDirectory?: string;

  @ApiPropertyOptional({
    description: 'Number of files per processing batch.',
    default: 5,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  batchSize?: number;
}
