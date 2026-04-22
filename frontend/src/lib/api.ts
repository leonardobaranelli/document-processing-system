import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const api = axios.create({
  baseURL: `${baseURL}/api/v1`,
  timeout: 15_000,
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    // Surface API error envelope to the UI as a structured message.
    const payload = error?.response?.data;
    const message = payload?.message ?? error?.message ?? 'Network error';
    return Promise.reject({ ...error, message, payload });
  },
);

export type ProcessStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'STOPPED';

export interface ProcessResults {
  total_words: number;
  total_lines: number;
  total_characters: number;
  most_frequent_words: string[];
  files_processed: string[];
  global_summary: string;
}

export interface PerDocumentAnalysis {
  filename: string;
  word_count: number;
  line_count: number;
  character_count: number;
  unique_words: number;
  average_word_length: number;
  top_words: string[];
  summary: string;
  summary_sentences: string[];
}

export interface ProcessResultsDetail extends ProcessResults {
  per_document: PerDocumentAnalysis[];
}

export interface ProcessDto {
  process_id: string;
  status: ProcessStatus;
  name?: string | null;
  progress: {
    total_files: number;
    processed_files: number;
    failed_files: number;
    percentage: number;
  };
  started_at?: string | null;
  estimated_completion?: string | null;
  completed_at?: string | null;
  stopped_at?: string | null;
  paused_at?: string | null;
  error_message?: string | null;
  results?: ProcessResults | null;
}

type Envelope<T> = { success: true; data: T; statusCode: number; timestamp: string };

export async function listProcesses() {
  const { data } = await api.get<Envelope<ProcessDto[]>>('/process/list');
  return data.data;
}
export async function getProcess(id: string) {
  const { data } = await api.get<Envelope<ProcessDto>>(`/process/status/${id}`);
  return data.data;
}
export async function getResults(id: string) {
  const { data } = await api.get<Envelope<ProcessResultsDetail>>(`/process/results/${id}`);
  return data.data;
}
export async function startProcess(body: {
  name?: string;
  inputDirectory?: string;
  batchSize?: number;
}) {
  const { data } = await api.post<Envelope<ProcessDto>>('/process/start', body);
  return data.data;
}
export async function stopProcess(id: string) {
  const { data } = await api.post<Envelope<ProcessDto>>(`/process/stop/${id}`);
  return data.data;
}
export async function pauseProcess(id: string) {
  const { data } = await api.post<Envelope<ProcessDto>>(`/process/pause/${id}`);
  return data.data;
}
export async function resumeProcess(id: string) {
  const { data } = await api.post<Envelope<ProcessDto>>(`/process/resume/${id}`);
  return data.data;
}
export async function getLogs(id: string, limit = 50) {
  const { data } = await api.get<Envelope<Array<{
    id: string;
    processId: string | null;
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    event: string;
    message: string;
    createdAt: string;
  }>>>(`/process/logs/${id}?limit=${limit}`);
  return data.data;
}
