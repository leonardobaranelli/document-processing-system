export const PROCESS_QUEUE = 'process-queue';

export const PROCESS_JOBS = {
  runBatch: 'run-batch',
} as const;

export type ProcessJobName = (typeof PROCESS_JOBS)[keyof typeof PROCESS_JOBS];

export interface RunBatchJobData {
  processId: string;
}
