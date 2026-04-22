import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

export const PROCESS_ROOM = (id: string) => `process:${id}`;
export const GLOBAL_ROOM = 'processes:global';

/**
 * Real-time gateway over Socket.IO.
 *
 * Rooms:
 *  - `processes:global` receives every state change (useful for dashboards).
 *  - `process:<uuid>` receives updates for one specific process.
 *
 * Events emitted:
 *  - `process:created`
 *  - `process:status`      (status changed)
 *  - `process:progress`    (progress % changed)
 *  - `process:log`         (activity log entry)
 *  - `process:completed`
 *  - `process:failed`
 *  - `process:stopped`
 */
@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? '*', credentials: true },
  namespace: '/',
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(EventsGateway.name);

  afterInit(): void {
    this.logger.log('WebSocket gateway initialized');
  }

  handleConnection(client: Socket): void {
    client.join(GLOBAL_ROOM);
    this.logger.debug(`ws client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`ws client disconnected: ${client.id}`);
  }

  @SubscribeMessage('process:subscribe')
  onSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { processId: string },
  ): { ok: true } {
    if (payload?.processId) client.join(PROCESS_ROOM(payload.processId));
    return { ok: true };
  }

  @SubscribeMessage('process:unsubscribe')
  onUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { processId: string },
  ): { ok: true } {
    if (payload?.processId) client.leave(PROCESS_ROOM(payload.processId));
    return { ok: true };
  }

  emitToProcess(processId: string, event: string, payload: unknown): void {
    this.server.to(PROCESS_ROOM(processId)).emit(event, payload);
    this.server.to(GLOBAL_ROOM).emit(event, payload);
  }

  emitGlobal(event: string, payload: unknown): void {
    this.server.to(GLOBAL_ROOM).emit(event, payload);
  }
}
