import { InternalServerErrorException, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { SequelizeModule } from '@nestjs/sequelize';
import { AppConfig } from '../../config/configuration';
import { User } from '../users/models/user.model';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './services/google-auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/**
 * Owns Google sign-in end to end: verifying the access token the extension
 * gets from chrome.identity, syncing the matching `users` row, and issuing
 * our own session JWT (used by JwtAuthGuard for every other route). No
 * Firebase involved anywhere in this flow. Registers its own feature binding
 * for User (independent of UsersModule) so other modules can import
 * AuthModule for JwtAuthGuard without a circular dependency.
 */
const jwtModule = JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const jwt = configService.getOrThrow<AppConfig['jwt']>('jwt', {
      infer: true,
    });
    if (!jwt.secret) {
      throw new InternalServerErrorException(
        'JWT_SECRET is not set - generate one and add it to .env',
      );
    }
    return { secret: jwt.secret, signOptions: { expiresIn: jwt.expiresIn } };
  },
});

@Module({
  imports: [SequelizeModule.forFeature([User]), jwtModule],
  controllers: [AuthController],
  providers: [GoogleAuthService, AuthService, JwtAuthGuard],
  // Re-export jwtModule too - JwtAuthGuard is instantiated in whichever
  // module uses it (UsersModule, RecordingsModule), so JwtService must be
  // resolvable there, not just here.
  exports: [AuthService, JwtAuthGuard, jwtModule],
})
export class AuthModule {}
