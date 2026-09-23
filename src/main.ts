// Must run before any other import - modules like model.configure.ts read
// process.env at import time (not lazily via ConfigService), which is before
// @nestjs/config's own ConfigModule.forRoot() would otherwise load .env.
import 'dotenv/config';

import { join } from 'path';
import * as compression from 'compression';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService<AppConfig>);

  // Trust the first proxy hop so req.ip reflects X-Forwarded-For when deployed
  // behind a reverse proxy/load balancer instead of the proxy's own address.
  app.set('trust proxy', 1);

  app.use(compression());

  app.enableCors({ origin: true });

  const { uploadDir, publicPath } = configService.getOrThrow(
    'imageProcessing',
    { infer: true },
  );
  app.useStaticAssets(join(process.cwd(), uploadDir), { prefix: publicPath });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Reacoder API')
    .setDescription('API documentation for the Reacoder backend')
    .setVersion('1.0')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, swaggerDocument);

  const port = configService.get<number>('port') ?? 3000;
  await app.listen(port);
  console.log('server is running....   http://localhost:3000/api');
}
bootstrap();
