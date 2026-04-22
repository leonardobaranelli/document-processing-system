import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export interface LoadedFile {
  filename: string;
  filepath: string;
  sizeBytes: number;
}

/**
 * Filesystem-level helpers for loading the input corpus.
 * Kept here (not in Process service) so we can swap the source later
 * (S3, HTTP, etc.) without touching processing logic.
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  /** Recursively list all .txt files under a directory. */
  async listTextFiles(dir: string): Promise<LoadedFile[]> {
    const out: LoadedFile[] = [];
    await this.walk(dir, out);
    return out.sort((a, b) => a.filename.localeCompare(b.filename));
  }

  /** Read a text file as UTF-8. */
  async readText(filepath: string): Promise<string> {
    return fs.readFile(filepath, 'utf8');
  }

  private async walk(dir: string, acc: LoadedFile[]): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      this.logger.warn(`Cannot read directory ${dir}: ${(err as Error).message}`);
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walk(fullPath, acc);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.txt')) {
        const stat = await fs.stat(fullPath);
        acc.push({ filename: entry.name, filepath: fullPath, sizeBytes: stat.size });
      }
    }
  }
}
