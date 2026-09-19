import { InternalServerErrorException, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { SequelizeModule } from '@nestjs/sequelize';
import { AppConfig } from '../../../config/configuration';
import { AdminUser } from '../models/admin-user.model';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';

/**
 * Owns admin sign-in end to end. Registers its OWN JwtModule instance keyed
 * off ADMIN_JWT_SECRET - deliberately not the JwtModule exported by
 * AuthModule - so admin sessions and user sessions can never be verified
 * with each other's secret. Any module that needs AdminJwtAuthGuard imports
 * AdminAuthModule (mirrors how AuthModule exports JwtAuthGuard).
 */
const adminJwtModule = JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const admin = configService.getOrThrow<AppConfig['admin']>('admin', {
      infer: true,
    });
    if (!admin.jwtSecret) {
      throw new InternalServerErrorException(
        'ADMIN_JWT_SECRET is not set - generate one and add it to .env',
      );
    }
    return {
      secret: admin.jwtSecret,
      signOptions: { expiresIn: admin.jwtExpiresIn },
    };
  },
});

@Module({
  imports: [SequelizeModule.forFeature([AdminUser]), adminJwtModule],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminJwtAuthGuard],
  exports: [AdminAuthService, AdminJwtAuthGuard, adminJwtModule],
})
export class AdminAuthModule {}
