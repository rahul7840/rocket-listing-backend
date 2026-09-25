import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './services/google-auth.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { GoogleWebLoginDto } from './dto/google-web-login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { User } from '../users/models/user.model';

@Controller('auth')
@ApiTags('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly googleAuthService: GoogleAuthService,
  ) {}

  /**
   * The only unauthenticated auth route: exchanges a Google OAuth access
   * token (from chrome.identity.getAuthToken() in the extension) for our own
   * session JWT, creating the user row on first sign-in.
   */
  @Post('google')
  async google(
    @Body() dto: GoogleLoginDto,
  ): Promise<{ accessToken: string; user: User }> {
    const profile = await this.googleAuthService.verifyAccessToken(
      dto.accessToken,
    );
    const user = await this.authService.findOrCreateAndSync(profile);
    return { accessToken: this.authService.issueToken(user), user };
  }

  /**
   * Website login: exchanges a Google Identity Services ID token for our own
   * session JWT. Parallel to google() above, not a replacement - the
   * extension keeps using the access-token flow untouched.
   */
  @Post('google/web')
  async googleWeb(
    @Body() dto: GoogleWebLoginDto,
  ): Promise<{ accessToken: string; user: User }> {
    const profile = await this.googleAuthService.verifyIdToken(dto.idToken);
    const user = await this.authService.findOrCreateAndSync(profile);
    return { accessToken: this.authService.issueToken(user), user };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: User): User {
    return user;
  }
}
