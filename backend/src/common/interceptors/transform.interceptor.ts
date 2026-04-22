import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiEnvelope<T> {
  success: true;
  statusCode: number;
  timestamp: string;
  data: T;
}

/**
 * Wraps every successful response in a uniform envelope.
 * Pairs with HttpExceptionFilter for consistent client contracts.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiEnvelope<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiEnvelope<T>> {
    const res = context.switchToHttp().getResponse();
    return next.handle().pipe(
      map((data) => ({
        success: true,
        statusCode: res.statusCode,
        timestamp: new Date().toISOString(),
        data,
      })),
    );
  }
}
