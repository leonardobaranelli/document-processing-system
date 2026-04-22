import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { ProcessController } from './process.controller';
import { ProcessService } from './process.service';
import { ProcessWorker } from './process.worker';
import { PROCESS_QUEUE } from './constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: PROCESS_QUEUE,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      },
    }),
  ],
  controllers: [ProcessController],
  providers: [ProcessService, ProcessWorker],
  exports: [ProcessService],
})
export class ProcessModule {}
