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
    example: 'Extractive summary built by re-running TextRank + MLP over the per-document summaries.',
  })
  global_summary!: string;
}

export class PerDocumentAnalysisDto {
  @ApiProperty({ example: '01-artificial-intelligence.txt' })
  filename!: string;
  @ApiProperty({ example: 715 }) word_count!: number;
  @ApiProperty({ example: 14 }) line_count!: number;
  @ApiProperty({ example: 5123 }) character_count!: number;
  @ApiProperty({ example: 312 }) unique_words!: number;
  @ApiProperty({ example: 5.12 }) average_word_length!: number;
  @ApiProperty({ example: ['ai', 'learning', 'neural'], type: [String] })
  top_words!: string[];
  @ApiProperty({
    example:
      'Artificial intelligence is a broad field of computer science dedicated to creating systems that can perform tasks that typically require human intelligence.',
  })
  summary!: string;
  @ApiProperty({
    example: [
      'Artificial intelligence is a broad field of computer science ...',
      'Modern AI systems are usually built around two complementary approaches.',
    ],
    type: [String],
  })
  summary_sentences!: string[];
}

/**
 * Extended results DTO returned by GET /process/results/:id.
 *
 * In addition to the aggregated metrics, this includes the per-document
 * analyses so clients can render summaries and statistics for every
 * processed file without issuing an extra round-trip per document.
 */
export class ProcessResultsDetailDto extends ProcessResultsDto {
  @ApiProperty({ type: [PerDocumentAnalysisDto] })
  per_document!: PerDocumentAnalysisDto[];
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
