import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RecordingsService } from './recordings.service';
import { CreateRecordingDto } from './dto/create-recording.dto';
import { UpdateRecordingDto } from './dto/update-recording.dto';
import { ApiTags } from '@nestjs/swagger';

@Controller('recordings')
@ApiTags('recordings')
export class RecordingsController {
  constructor(private readonly recordingsService: RecordingsService) { }

  @Post()
  create(@Body() dto: CreateRecordingDto) {
    return this.recordingsService.create(dto);
  }

  @Get()
  findAll(@Query('userId') userId?: string) {
    return this.recordingsService.findAll(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.recordingsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRecordingDto) {
    return this.recordingsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.recordingsService.remove(id);
  }
}
