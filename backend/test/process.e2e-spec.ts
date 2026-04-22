import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

/**
 * E2E smoke test for the Process Control API.
 *
 * Requires Postgres + Redis to be available (see docker-compose).
 * Run with:  `docker compose up -d postgres redis && npm run test:e2e`
 */
describe('Process Control API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const modRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/process/list -> 200 (envelope)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/process/list').expect(200);
    expect(res.body).toMatchObject({ success: true, statusCode: 200 });
    expect(res.body).toHaveProperty('timestamp');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /api/v1/process/start -> 201 (if sample-data exists)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/process/start')
      .send({ name: 'e2e-test' });
    // When sample-data is absent in the test runner, the controller returns 400.
    expect([201, 400]).toContain(res.status);
    if (res.status === 201) {
      expect(res.body).toMatchObject({ success: true, statusCode: 201 });
      expect(res.body.data).toHaveProperty('process_id');
      expect(res.body.data).toHaveProperty('status');
      expect(res.body.data).toHaveProperty('progress');
    }
  });

  it('GET /api/v1/process/status/:id -> 404 for unknown uuid', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/process/status/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false });
  });
});
