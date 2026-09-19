import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';
import { CurrentAdmin } from './decorators/current-admin.decorator';
import { AdminUser } from '../models/admin-user.model';

@Controller('admin/auth')
@ApiTags('admin')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  /** The only unauthenticated admin route: email/password login against admin_users. */
  @Post('login')
  async login(@Body() dto: AdminLoginDto): Promise<{
    accessToken: string;
    admin: { adminUserId: string; email: string; name: string };
  }> {
    const admin = await this.adminAuthService.login(dto.email, dto.password);
    return {
      accessToken: this.adminAuthService.issueToken(admin),
      admin: {
        adminUserId: admin.adminUserId,
        email: admin.email,
        name: admin.name,
      },
    };
  }

  @Get('me')
  @UseGuards(AdminJwtAuthGuard)
  @ApiBearerAuth()
  me(@CurrentAdmin() admin: AdminUser): AdminUser {
    return admin;
  }
}
