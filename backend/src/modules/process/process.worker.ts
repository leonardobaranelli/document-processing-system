import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import {
  DocumentStatus,
  LogLevel,
  Prisma,
  ProcessStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { AiService, DocumentAnalysis } from '../ai/ai.service';
import { EventsGateway } from '../events/events.gateway';
import { PROCESS_JOBS, PROCESS_QUEUE, RunBatchJobData } from './constants';
import { ProcessService } from './process.service';

/**
 * BullMQ worker that executes the actual processing.
 *
 * Execution loop (per job):
 *  1) Load the Process record, transition PENDING/PAUSED -> RUNNING.
 *  2) Grab the next batch of PENDING documents.
 *  3) For each document (with bounded parallelism = WORKER_CONCURRENCY):
 *       - Read file
 *       - Run AiService.analyzeDocument
 *       - Persist DocumentAnalysis
 *       - Update Document.status
 *       - Update Process progress + emit events
 *  4) Between batches, re-read Process.status: if STOPPED or PAUSED, exit gracefully.
 *  5) When there are no more PENDING documents, aggregate results and mark COMPLETED.
 *
 * Errors in a single document are captured and turned into DocumentStatus.FAILED
 * without blowing up the whole process (graceful degradation).
 */
@Processor(PROCESS_QUEUE)
export class ProcessWorker extends WorkerHost {
  private readonly logger = new Logger(ProcessWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly docs: DocumentsService,
    private readonly ai: AiService,
    private readonly gateway: EventsGateway,
    private readonly config: ConfigService,
    private readonly processService: ProcessService,
  ) {
    super();
  }

  async process(job: Job<RunBatchJobData>): Promise<void> {
    if (job.name !== PROCESS_JOBS.runBatch) return;
    const { processId } = job.data;
    this.logger.log(`Executing job ${job.id} for process ${processId}`);

    await this.transitionToRunning(processId);

    const concurrency = Math.max(
      1,
      this.config.get<number>('app.processing.workerConcurrency') ?? 4,
    );

    while (true) {
      const current = await this.prisma.process.findUnique({
        where: { id: processId },
        select: { id: true, status: true, batchSize: true },
      });
      if (!current) {
        this.logger.warn(`Process ${processId} disappeared, aborting`);
        return;
      }
      if (current.status !== ProcessStatus.RUNNING) {
        this.logger.log(`Stopping loop for ${processId}: status=${current.status}`);
        return;
      }

      const batch = await this.prisma.document.findMany({
        where: { processId, status: DocumentStatus.PENDING },
        take: current.batchSize,
        orderBy: { createdAt: 'asc' },
      });
      if (batch.length === 0) break;

      await this.processService.logEvent(
        processId,
        LogLevel.INFO,
        'batch.started',
        `Starting batch of ${batch.length} file(s).`,
      );

      await this.runBatchWithConcurrency(batch, concurrency, processId);

      await this.recomputeProgress(processId);
    }

    await this.finalizeProcess(processId);
  }

  // ---------- Helpers ----------

  private async transitionToRunning(processId: string): Promise<void> {
    const res = await this.prisma.process.updateMany({
      where: {
        id: processId,
        status: { in: [ProcessStatus.PENDING, ProcessStatus.PAUSED] },
      },
      data: { status: ProcessStatus.RUNNING, startedAt: new Date() },
    });
    if (res.count > 0) {
      const p = await this.processService.getProcess(processId);
      this.gateway.emitToProcess(processId, 'process:status', p);
      await this.processService.logEvent(
        processId,
        LogLevel.INFO,
        'process.running',
        'Process moved to RUNNING.',
      );
    }
  }

  private async runBatchWithConcurrency(
    batch: Array<{ id: string; processId: string; filename: string; filepath: string }>,
    concurrency: number,
    processId: string,
  ): Promise<void> {
    let cursor = 0;

    const worker = async () => {
      while (cursor < batch.length) {
        const idx = cursor++;
        const doc = batch[idx];

        // Between documents, respect user-controlled state changes.
        const alive = await this.prisma.process.findUnique({
          where: { id: processId },
          select: { status: true },
        });
        if (alive?.status !== ProcessStatus.RUNNING) return;

        await this.processDocument(doc);
      }
    };

    const pool = Array.from({ length: Math.min(concurrency, batch.length) }, () => worker());
    await Promise.all(pool);
  }

  private async processDocument(doc: {
    id: string;
    processId: string;
    filename: string;
    filepath: string;
  }): Promise<void> {
    const startedAt = new Date();
    await this.prisma.document.update({
      where: { id: doc.id },
      data: { status: DocumentStatus.PROCESSING, startedAt },
    });

    let analysis: DocumentAnalysis;
    try {
      const text = await this.docs.readText(doc.filepath);
      analysis = this.ai.analyzeDocument(text);
    } catch (err) {
      const message = (err as Error).message ?? 'unknown failure';
      await this.prisma.document.update({
        where: { id: doc.id },
        data: {
          status: DocumentStatus.FAILED,
          errorMessage: message,
          finishedAt: new Date(),
        },
      });
      await this.prisma.process.update({
        where: { id: doc.processId },
        data: { failedFiles: { increment: 1 } },
      });
      await this.processService.logEvent(
        doc.processId,
        LogLevel.ERROR,
        'document.failed',
        `Document "${doc.filename}" failed: ${message}`,
        { documentId: doc.id },
      );
      return;
    }

    await this.prisma.$transaction([
      this.prisma.documentAnalysis.create({
        data: {
          documentId: doc.id,
          wordCount: analysis.wordCount,
          lineCount: analysis.lineCount,
          characterCount: analysis.characterCount,
          uniqueWords: analysis.uniqueWords,
          averageWordLength: analysis.averageWordLength,
          topWords: analysis.topWords as unknown as Prisma.InputJsonValue,
          summary: analysis.summary,
          summarySentences: analysis.summarySentences as unknown as Prisma.InputJsonValue,
          mlpImportance: analysis.mlpImportance as unknown as Prisma.InputJsonValue,
        },
      }),
      this.prisma.document.update({
        where: { id: doc.id },
        data: { status: DocumentStatus.PROCESSED, finishedAt: new Date() },
      }),
      this.prisma.process.update({
        where: { id: doc.processId },
        data: { processedFiles: { increment: 1 } },
      }),
    ]);

    await this.processService.logEvent(
      doc.processId,
      LogLevel.INFO,
      'document.processed',
      `Document "${doc.filename}" processed (${analysis.wordCount} words, ${analysis.lineCount} lines).`,
      { documentId: doc.id },
    );
  }

  private async recomputeProgress(processId: string): Promise<void> {
    const p = await this.prisma.process.findUnique({
      where: { id: processId },
      select: { processedFiles: true, failedFiles: true, totalFiles: true, startedAt: true },
    });
    if (!p) return;
    const handled = p.processedFiles + p.failedFiles;
    const pct = p.totalFiles > 0 ? Math.floor((handled / p.totalFiles) * 100) : 0;

    // ETA: simple linear extrapolation based on rate so far.
    let estimated: Date | null = null;
    if (p.startedAt && handled > 0 && handled < p.totalFiles) {
      const elapsed = Date.now() - p.startedAt.getTime();
      const perFile = elapsed / handled;
      const remainingMs = perFile * (p.totalFiles - handled);
      estimated = new Date(Date.now() + remainingMs);
    }

    await this.prisma.process.update({
      where: { id: processId },
      data: { progressPercentage: pct, estimatedCompletion: estimated ?? undefined },
    });
    const hydrated = await this.processService.getProcess(processId);
    this.gateway.emitToProcess(processId, 'process:progress', hydrated);
  }

  private async finalizeProcess(processId: string): Promise<void> {
    const [totals, processed] = await Promise.all([
      this.prisma.process.findUnique({ where: { id: processId } }),
      this.prisma.document.findMany({
        where: { processId, status: DocumentStatus.PROCESSED },
        include: { analysis: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    if (!totals) return;
    if (totals.status !== ProcessStatus.RUNNING) return;

    const perDoc = processed
      .filter((d) => d.analysis)
      .map((d) => ({
        filename: d.filename,
        analysis: {
          wordCount: d.analysis!.wordCount,
          lineCount: d.analysis!.lineCount,
          characterCount: d.analysis!.characterCount,
          uniqueWords: d.analysis!.uniqueWords,
          averageWordLength: d.analysis!.averageWordLength,
          topWords: d.analysis!.topWords as Array<{ word: string; count: number }>,
          summary: d.analysis!.summary,
          summarySentences: d.analysis!.summarySentences as string[],
          mlpImportance: d.analysis!.mlpImportance as number[],
        },
      }));

    const aggregate = this.ai.aggregate(perDoc);
    const noDocsProcessed = processed.length === 0;
    const allFailed = totals.totalFiles > 0 && totals.failedFiles === totals.totalFiles;
    const finalStatus = allFailed ? ProcessStatus.FAILED : ProcessStatus.COMPLETED;

    await this.prisma.$transaction([
      this.prisma.analysisResult.upsert({
        where: { processId },
        create: {
          processId,
          totalWords: aggregate.totalWords,
          totalLines: aggregate.totalLines,
          totalCharacters: aggregate.totalCharacters,
          mostFrequentWords: aggregate.mostFrequentWords as unknown as Prisma.InputJsonValue,
          filesProcessed: aggregate.filesProcessed as unknown as Prisma.InputJsonValue,
          globalSummary: aggregate.globalSummary,
        },
        update: {
          totalWords: aggregate.totalWords,
          totalLines: aggregate.totalLines,
          totalCharacters: aggregate.totalCharacters,
          mostFrequentWords: aggregate.mostFrequentWords as unknown as Prisma.InputJsonValue,
          filesProcessed: aggregate.filesProcessed as unknown as Prisma.InputJsonValue,
          globalSummary: aggregate.globalSummary,
        },
      }),
      this.prisma.process.update({
        where: { id: processId },
        data: {
          status: finalStatus,
          progressPercentage: 100,
          completedAt: new Date(),
          errorMessage: allFailed ? 'All documents failed to process.' : null,
        },
      }),
    ]);

    await this.processService.logEvent(
      processId,
      allFailed ? LogLevel.ERROR : LogLevel.INFO,
      allFailed ? 'process.failed' : 'process.completed',
      allFailed
        ? 'Process finished with all documents failed.'
        : `Process finished. ${processed.length}/${totals.totalFiles} document(s) analyzed.`,
      { noDocsProcessed },
    );

    const hydrated = await this.processService.getProcess(processId);
    this.gateway.emitToProcess(processId, 'process:status', hydrated);
    this.gateway.emitToProcess(
      processId,
      allFailed ? 'process:failed' : 'process:completed',
      hydrated,
    );
  }
}
