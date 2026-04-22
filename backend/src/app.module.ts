import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { LoggerModule } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'http';

import { appConfig } from './config/app.config';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './modules/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AiModule } from './modules/ai/ai.module';
import { ProcessModule } from './modules/process/process.module';
import { EventsModule } from './modules/events/events.module';
import { DocumentsModule } from './modules/documents/documents.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validate: validateEnv,
      cache: true,
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get<string>('NODE_ENV') === 'production';
        const level = config.get<string>('LOG_LEVEL') ?? (isProd ? 'info' : 'debug');

        return {
          pinoHttp: {
            level,
            transport: isProd
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: {
                    singleLine: true,
                    colorize: true,
                    translateTime: 'SYS:HH:MM:ss.l',
                    ignore: 'pid,hostname,req,res,responseTime,context',
                    messageFormat: '{context} {msg}',
                  },
                },
            autoLogging: {
              ignore: (req: IncomingMessage) => {
                const url = req.url ?? '';
                return (
                  url.startsWith('/api/v1/health') ||
                  url.startsWith('/docs') ||
                  url.startsWith('/socket.io')
                );
              },
            },
            customLogLevel: (_req, res, err) => {
              const status = res.statusCode;
              if (err || status >= 500) return 'error';
              if (status >= 400) return 'warn';
              return 'info';
            },
            customSuccessMessage: (req: IncomingMessage, res: ServerResponse) => {
              return `${req.method} ${req.url} -> ${res.statusCode}`;
            },
            customErrorMessage: (req: IncomingMessage, res: ServerResponse) => {
              return `${req.method} ${req.url} -> ${res.statusCode}`;
            },
            serializers: {
              req: (req) => ({ method: req.method, url: req.url }),
              res: (res) => ({ statusCode: res.statusCode }),
            },
            redact: ['req.headers.authorization', 'req.headers.cookie'],
            customProps: () => ({ service: 'document-processing-api' }),
          },
        };
      },
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    PrismaModule,
    HealthModule,
    AiModule,
    EventsModule,
    DocumentsModule,
    ProcessModule,
  ],
})
export class AppModule {}
