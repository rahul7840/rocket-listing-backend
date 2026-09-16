import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from './models/user.model';

/**
 * Accounts are only ever created via POST /auth/google (Google-verified
 * sign-in) - there is no direct create endpoint here. Every route
 * below is scoped to the caller's own row; there is no admin role yet.
 */
@Controller('users')
@ApiTags('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    this.assertSelf(id, user);
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: User,
  ) {
    this.assertSelf(id, user);
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    this.assertSelf(id, user);
    return this.usersService.remove(id);
  }

  private assertSelf(id: string, user: User): void {
    if (id !== user.id) {
      throw new ForbiddenException('You may only access your own account');
    }
  }
}
