import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './modules/users/users.module';
import { RecordingsModule } from './modules/recordings/recordings.module';
import { ListingGeneratorModule } from './modules/listing-generator/listing-generator.module';
import { ImageProcessingModule } from './modules/image-processing/image-processing.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    DatabaseModule,
    UsersModule,
    RecordingsModule,
    ListingGeneratorModule,
    ImageProcessingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
