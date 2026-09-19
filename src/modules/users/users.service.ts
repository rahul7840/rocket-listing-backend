import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, WhereOptions } from 'sequelize';
import { User } from './models/user.model';
import { UpdateUserDto } from './dto/update-user.dto';

export interface FindAllUsersOptions {
  page?: number;
  limit?: number;
  /** Matched against email/displayName, case-insensitive substring. */
  search?: string;
  isActive?: boolean;
}

export interface PaginatedUsers {
  data: User[];
  total: number;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User)
    private readonly userModel: typeof User,
  ) {}

  /** Paginated, filterable list of all users - used by the admin module (no user-facing equivalent needed, every other route here is self-scoped). */
  async findAll(options: FindAllUsersOptions = {}): Promise<PaginatedUsers> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;

    const where: WhereOptions = {
      ...(options.isActive !== undefined ? { isActive: options.isActive } : {}),
      ...(options.search
        ? {
            [Op.or]: [
              { email: { [Op.iLike]: `%${options.search}%` } },
              { displayName: { [Op.iLike]: `%${options.search}%` } },
            ],
          }
        : {}),
    };

    const { rows, count } = await this.userModel.findAndCountAll({
      where,
      limit,
      offset: (page - 1) * limit,
      order: [['createdAt', 'DESC']],
    });

    return { data: rows, total: count };
  }

  /** Admin-driven activate/deactivate - separate from `update` since UpdateUserDto (self-service profile edit) doesn't expose isActive. */
  async setActive(id: string, isActive: boolean): Promise<User> {
    const user = await this.findOne(id);
    return user.update({ isActive });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userModel.findByPk(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    return user.update({ ...dto });
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await user.destroy();
  }
}
