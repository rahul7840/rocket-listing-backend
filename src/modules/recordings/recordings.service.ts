import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Recording } from './models/recording.model';
import { CreateRecordingDto } from './dto/create-recording.dto';
import { UpdateRecordingDto } from './dto/update-recording.dto';

@Injectable()
export class RecordingsService {
  constructor(
    @InjectModel(Recording)
    private readonly recordingModel: typeof Recording,
  ) {}

  findAll(userId: string): Promise<Recording[]> {
    return this.recordingModel.findAll({
      where: { userId },
      order: [['updatedAt', 'DESC']],
    });
  }

  async findOne(id: string, userId: string): Promise<Recording> {
    const recording = await this.recordingModel.findOne({
      where: { id, userId },
    });
    if (!recording) {
      throw new NotFoundException(`Recording ${id} not found`);
    }
    return recording;
  }

  create(userId: string, dto: CreateRecordingDto): Promise<Recording> {
    return this.recordingModel.create({ ...dto, userId });
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateRecordingDto,
  ): Promise<Recording> {
    const recording = await this.findOne(id, userId);
    return recording.update({ ...dto });
  }

  async remove(id: string, userId: string): Promise<void> {
    const recording = await this.findOne(id, userId);
    await recording.destroy();
  }
}
