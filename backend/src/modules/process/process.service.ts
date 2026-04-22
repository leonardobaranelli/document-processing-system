import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { LogLevel, Prisma, Process, ProcessStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { EventsGateway } from '../events/events.gateway';
import { StartProcessDto } from './dto/start-process.dto';
import {
  PerDocumentAnalysisDto,
  ProcessResponseDto,
  ProcessResultsDetailDto,
  ProcessResultsDto,
} from './dto/process-response.dto';
import { PROCESS_JOBS, PROCESS_QUEUE, RunBatchJobData } from './constants';

/**
 * ProcessService: the orchestration layer of the system.
 *
 * Responsibilities:
 *  - CRUD on Process records (create, list, read).
 *  - State machine transitions: PENDING -> RUNNING -> (PAUSED) -> COMPLETED / FAILED / STOPPED.
 *  - Enqueues BullMQ jobs that perform the actual async work.
 *  - Persists per-process activity logs and emits realtime events.
 *
 * Concurrency:
 *  - State changes use Prisma updates with `where: { id, status: <expected> }`
 *    so we never overwrite a status we didn't expect (optimistic lock).
 *  - The worker polls `status` before each batch so stop/pause take effect
 *    between batches without touching low-level OS cancellation.
 */
@Injectable()
export class ProcessService {
  private readonly logger = new Logger(ProcessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly docs: DocumentsService,
    private readonly gateway: EventsGateway,
    private readonly config: ConfigService,
    @InjectQueue(PROCESS_QUEUE) private readonly queue: Queue<RunBatchJobData>,
  ) {}

  // ---------- Commands ----------

  async startProcess(dto: StartProcessDto): Promise<ProcessResponseDto> {
    const inputDirectory =
      dto.inputDirectory ?? this.config.get<string>('app.processing.inputDirectory')!;
    const batchSize = dto.batchSize ?? this.config.get<number>('app.processing.batchSize')!;

    const files = await this.docs.listTextFiles(inputDirectory);
    if (files.length === 0) {
      throw new BadRequestException(
        `No .txt files were found in "${inputDirectory}". Nothing to process.`,
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const p = await tx.process.create({
        data: {
          name: dto.name,
          status: ProcessStatus.PENDING,
          inputDirectory,
          batchSize,
          totalFiles: files.length,
          documents: {
            create: files.map((f) => ({
              filename: f.filename,
              filepath: f.filepath,
              sizeBytes: f.sizeBytes,
            })),
          },
        },
      });
      await tx.activityLog.create({
        data: {
          processId: p.id,
          level: LogLevel.INFO,
          event: 'process.created',
          message: `Process created with ${files.length} file(s) at batchSize=${batchSize}.`,
          metadata: { inputDirectory, files: files.map((f) => f.filename) },
        },
      });
      return p;
    });

    await this.queue.add(
      PROCESS_JOBS.runBatch,
      { processId: created.id },
      { jobId: created.id, removeOnComplete: true, removeOnFail: false, attempts: 1 },
    );

    const hydrated = await this.getProcess(created.id);
    this.gateway.emitGlobal('process:created', hydrated);
    return hydrated;
  }

  async stopProcess(id: string): Promise<ProcessResponseDto> {
    await this.ensureExists(id);
    const result = await this.prisma.process.updateMany({
      where: {
        id,
        status: { in: [ProcessStatus.PENDING, ProcessStatus.RUNNING, ProcessStatus.PAUSED] },
      },
      data: { status: ProcessStatus.STOPPED, stoppedAt: new Date() },
    });
    if (result.count === 0) {
      throw new BadRequestException(
        'Process cannot be stopped from its current state.',
      );
    }
    await this.logEvent(id, LogLevel.INFO, 'process.stopped', 'Process stopped by user.');
    const p = await this.getProcess(id);
    this.gateway.emitToProcess(id, 'process:status', p);
    this.gateway.emitToProcess(id, 'process:stopped', p);
    return p;
  }

  async pauseProcess(id: string): Promise<ProcessResponseDto> {
    await this.ensureExists(id);
    const result = await this.prisma.process.updateMany({
      where: { id, status: ProcessStatus.RUNNING },
      data: { status: ProcessStatus.PAUSED, pausedAt: new Date() },
    });
    if (result.count === 0) {
      throw new BadRequestException('Only RUNNING processes can be paused.');
    }
    await this.logEvent(id, LogLevel.INFO, 'process.paused', 'Process paused.');
    const p = await this.getProcess(id);
    this.gateway.emitToProcess(id, 'process:status', p);
    return p;
  }

  async resumeProcess(id: string): Promise<ProcessResponseDto> {
    await this.ensureExists(id);
    const result = await this.prisma.process.updateMany({
      where: { id, status: ProcessStatus.PAUSED },
      data: { status: ProcessStatus.RUNNING, resumedAt: new Date() },
    });
    if (result.count === 0) {
      throw new BadRequestException('Only PAUSED processes can be resumed.');
    }
    await this.logEvent(id, LogLevel.INFO, 'process.resumed', 'Process resumed.');
    await this.queue.add(
      PROCESS_JOBS.runBatch,
      { processId: id },
      { jobId: `${id}-resume-${Date.now()}`, removeOnComplete: true, attempts: 1 },
    );
    const p = await this.getProcess(id);
    this.gateway.emitToProcess(id, 'process:status', p);
    return p;
  }

  // ---------- Queries ----------

  async getProcess(id: string): Promise<ProcessResponseDto> {
    const p = await this.prisma.process.findUnique({
      where: { id },
      include: { result: true },
    });
    if (!p) throw new NotFoundException(`Process ${id} not found.`);
    return this.toResponse(p, p.result);
  }

  async listProcesses(): Promise<ProcessResponseDto[]> {
    const rows = await this.prisma.process.findMany({
      orderBy: { createdAt: 'desc' },
      include: { result: true },
      take: 200,
    });
    return rows.map((r) => this.toResponse(r, r.result));
  }

  async getResults(id: string): Promise<ProcessResultsDetailDto> {
    const p = await this.prisma.process.findUnique({
      where: { id },
      include: {
        result: true,
        documents: {
          include: { analysis: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!p) throw new NotFoundException(`Process ${id} not found.`);
    if (!p.result) {
      throw new BadRequestException(
        `Process ${id} has no results yet (current status: ${p.status}).`,
      );
    }

    const perDocument: PerDocumentAnalysisDto[] = p.documents
      .filter((d) => d.analysis)
      .map((d) => {
        const a = d.analysis!;
        const topWords = (a.topWords as Array<{ word: string; count: number }>).map(
          (w) => w.word,
        );
        return {
          filename: d.filename,
          word_count: a.wordCount,
          line_count: a.lineCount,
          character_count: a.characterCount,
          unique_words: a.uniqueWords,
          average_word_length: a.averageWordLength,
          top_words: topWords,
          summary: a.summary,
          summary_sentences: a.summarySentences as string[],
        };
      });

    return {
      ...this.toResultsDto(p.result),
      per_document: perDocument,
    };
  }

  async getActivityLog(id: string, limit = 100) {
    await this.ensureExists(id);
    return this.prisma.activityLog.findMany({
      where: { processId: id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ---------- Internals shared with the worker ----------

  async logEvent(
    processId: string | null,
    level: LogLevel,
    event: string,
    message: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    const row = await this.prisma.activityLog.create({
      data: { processId, level, event, message, metadata: metadata ?? undefined },
    });
    if (processId) {
      this.gateway.emitToProcess(processId, 'process:log', {
        id: row.id,
        processId,
        level,
        event,
        message,
        createdAt: row.createdAt.toISOString(),
      });
    }
  }

  private async ensureExists(id: string): Promise<void> {
    const exists = await this.prisma.process.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException(`Process ${id} not found.`);
  }

  // ---------- Mapping ----------

  private toResponse(
    p: Process,
    r: Awaited<ReturnType<PrismaService['analysisResult']['findUnique']>> | null,
  ): ProcessResponseDto {
    return {
      process_id: p.id,
      status: p.status,
      name: p.name ?? null,
      progress: {
        total_files: p.totalFiles,
        processed_files: p.processedFiles,
        failed_files: p.failedFiles,
        percentage: p.progressPercentage,
      },
      started_at: p.startedAt?.toISOString() ?? null,
      estimated_completion: p.estimatedCompletion?.toISOString() ?? null,
      completed_at: p.completedAt?.toISOString() ?? null,
      stopped_at: p.stoppedAt?.toISOString() ?? null,
      paused_at: p.pausedAt?.toISOString() ?? null,
      error_message: p.errorMessage ?? null,
      results: r ? this.toResultsDto(r) : null,
    };
  }

  private toResultsDto(
    r: NonNullable<Awaited<ReturnType<PrismaService['analysisResult']['findUnique']>>>,
  ): ProcessResultsDto {
    return {
      total_words: r.totalWords,
      total_lines: r.totalLines,
      total_characters: r.totalCharacters,
      most_frequent_words: (r.mostFrequentWords as Array<{ word: string }>).map((w) => w.word),
      files_processed: r.filesProcessed as string[],
      global_summary: r.globalSummary,
    };
  }
}
