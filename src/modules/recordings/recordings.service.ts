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

  findAll(userId?: string): Promise<Recording[]> {
    return this.recordingModel.findAll({
      where: userId ? { userId } : undefined,
      order: [['updatedAt', 'DESC']],
    });
  }

  async findOne(id: string): Promise<Recording> {
    const recording = await this.recordingModel.findByPk(id);
    if (!recording) {
      throw new NotFoundException(`Recording ${id} not found`);
    }
    return recording;
  }

  create(dto: CreateRecordingDto): Promise<Recording> {
    return this.recordingModel.create({ ...dto });
  }

  async update(id: string, dto: UpdateRecordingDto): Promise<Recording> {
    const recording = await this.findOne(id);
    return recording.update({ ...dto });
  }

  async remove(id: string): Promise<void> {
    const recording = await this.findOne(id);
    await recording.destroy();
  }
}
