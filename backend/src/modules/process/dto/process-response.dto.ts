import { ApiProperty } from '@nestjs/swagger';
import { ProcessStatus } from '@prisma/client';

export class ProcessProgressDto {
  @ApiProperty({ example: 10 }) total_files!: number;
  @ApiProperty({ example: 3 }) processed_files!: number;
  @ApiProperty({ example: 0 }) failed_files!: number;
  @ApiProperty({ example: 30 }) percentage!: number;
}

export class ProcessResultsDto {
  @ApiProperty({ example: 1500 }) total_words!: number;
  @ApiProperty({ example: 75 }) total_lines!: number;
  @ApiProperty({ example: 9123 }) total_characters!: number;
  @ApiProperty({ example: ['the', 'of', 'and', 'to', 'a'], type: [String] })
  most_frequent_words!: string[];
  @ApiProperty({ example: ['doc1.txt', 'doc2.txt', 'doc3.txt'], type: [String] })
  files_processed!: string[];
  @ApiProperty({
    example: 'Extractive summary combining TextRank and MLP-scored sentences.',
  })
  global_summary!: string;
}

export class ProcessResponseDto {
  @ApiProperty({ example: 'f6b5c3c4-2a39-4c63-9b35-0f4b4e8b37a2' }) process_id!: string;
  @ApiProperty({ enum: ProcessStatus, example: ProcessStatus.RUNNING })
  status!: ProcessStatus;
  @ApiProperty({ required: false, example: 'Monthly contracts batch' })
  name?: string | null;
  @ApiProperty() progress!: ProcessProgressDto;
  @ApiProperty({ required: false, example: '2024-01-15T10:30:00.000Z' })
  started_at?: string | null;
  @ApiProperty({ required: false, example: '2024-01-15T10:32:00.000Z' })
  estimated_completion?: string | null;
  @ApiProperty({ required: false, example: '2024-01-15T10:31:00.000Z' })
  completed_at?: string | null;
  @ApiProperty({ required: false }) stopped_at?: string | null;
  @ApiProperty({ required: false }) paused_at?: string | null;
  @ApiProperty({ required: false }) error_message?: string | null;
  @ApiProperty({ required: false, type: ProcessResultsDto })
  results?: ProcessResultsDto | null;
}
