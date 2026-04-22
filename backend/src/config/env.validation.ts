import { plainToInstance, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvSchema {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT = 3000;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  @IsOptional()
  REDIS_HOST = 'localhost';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  REDIS_PORT = 6379;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(64)
  @IsOptional()
  WORKER_CONCURRENCY = 4;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  @IsOptional()
  BATCH_SIZE = 5;

  @IsString()
  @IsOptional()
  DOCUMENTS_INPUT_DIR = '/app/sample-data';

  @IsString()
  @IsOptional()
  CORS_ORIGIN = '*';

  @IsString()
  @IsOptional()
  LOG_LEVEL = 'info';
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvSchema, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(
      'Invalid environment configuration:\n' +
        errors.map((e) => ` - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`).join('\n'),
    );
  }
  return validated;
}
