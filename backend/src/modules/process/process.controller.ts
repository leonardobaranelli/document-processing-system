import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ProcessService } from './process.service';
import { StartProcessDto } from './dto/start-process.dto';
import {
  ProcessResponseDto,
  ProcessResultsDetailDto,
} from './dto/process-response.dto';

@ApiTags('process')
@Controller({ path: 'process', version: '1' })
export class ProcessController {
  constructor(private readonly svc: ProcessService) {}

  @Post('start')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start a new analysis process.' })
  @ApiBody({ type: StartProcessDto, required: false })
  @ApiResponse({ status: 201, type: ProcessResponseDto })
  start(@Body() dto: StartProcessDto = {}): Promise<ProcessResponseDto> {
    return this.svc.startProcess(dto);
  }

  @Post('stop/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop a running, pending, or paused process.' })
  @ApiParam({ name: 'id', description: 'Process UUID', example: 'f6b5c3c4-2a39-4c63-9b35-0f4b4e8b37a2' })
  @ApiResponse({ status: 200, type: ProcessResponseDto })
  stop(@Param('id', new ParseUUIDPipe()) id: string): Promise<ProcessResponseDto> {
    return this.svc.stopProcess(id);
  }

  @Post('pause/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause a running process.' })
  @ApiParam({ name: 'id', description: 'Process UUID' })
  @ApiResponse({ status: 200, type: ProcessResponseDto })
  pause(@Param('id', new ParseUUIDPipe()) id: string): Promise<ProcessResponseDto> {
    return this.svc.pauseProcess(id);
  }

  @Post('resume/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume a paused process.' })
  @ApiParam({ name: 'id', description: 'Process UUID' })
  @ApiResponse({ status: 200, type: ProcessResponseDto })
  resume(@Param('id', new ParseUUIDPipe()) id: string): Promise<ProcessResponseDto> {
    return this.svc.resumeProcess(id);
  }

  @Get('status/:id')
  @ApiOperation({ summary: 'Query the status of a process.' })
  @ApiParam({ name: 'id', description: 'Process UUID' })
  @ApiResponse({ status: 200, type: ProcessResponseDto })
  status(@Param('id', new ParseUUIDPipe()) id: string): Promise<ProcessResponseDto> {
    return this.svc.getProcess(id);
  }

  @Get('list')
  @ApiOperation({ summary: 'List all processes and their states.' })
  @ApiResponse({ status: 200, type: ProcessResponseDto, isArray: true })
  list(): Promise<ProcessResponseDto[]> {
    return this.svc.listProcesses();
  }

  @Get('results/:id')
  @ApiOperation({
    summary:
      'Get aggregated analysis results for a process, including per-document summaries and statistics.',
  })
  @ApiParam({ name: 'id', description: 'Process UUID' })
  @ApiResponse({ status: 200, type: ProcessResultsDetailDto })
  results(@Param('id', new ParseUUIDPipe()) id: string): Promise<ProcessResultsDetailDto> {
    return this.svc.getResults(id);
  }

  @Get('logs/:id')
  @ApiOperation({ summary: 'Get recent activity log entries for a process.' })
  @ApiParam({ name: 'id', description: 'Process UUID' })
  logs(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Math.min(1000, Math.max(1, Number(limit) || 100));
    return this.svc.getActivityLog(id, parsed);
  }
}
