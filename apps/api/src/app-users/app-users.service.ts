import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppUser } from '../entities/app-user.entity';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class AppUsersService {
  constructor(
    @InjectRepository(AppUser) private readonly repo: Repository<AppUser>,
    private readonly audit: AuditService,
    private readonly authService: AuthService,
  ) {}

  findAll() {
    return this.repo.find({ select: ['id', 'email', 'rolle', 'organisationId', 'twofaEnabled'], order: { email: 'ASC' } });
  }

  findOne(id: string) {
    return this.repo.findOne({ where: { id }, select: ['id', 'email', 'rolle', 'organisationId', 'twofaEnabled'] });
  }

  async create(data: { email: string; password: string; rolle: string; organisationId?: string }, userId: string) {
    const hashed = await this.authService.hashPassword(data.password);
    const user = this.repo.create({ ...data, password: hashed });
    const saved = await this.repo.save(user);
    await this.audit.log({ entity: 'app_user', entityId: saved.id, aktion: 'create', neu: { email: saved.email, rolle: saved.rolle } as any, userId });
    return { id: saved.id, email: saved.email, rolle: saved.rolle };
  }

  async update(id: string, data: Partial<AppUser>, userId: string) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException();
    const alt = { email: existing.email, rolle: existing.rolle };
    if (data.password) data.password = await this.authService.hashPassword(data.password as string);
    Object.assign(existing, data);
    const saved = await this.repo.save(existing);
    await this.audit.log({ entity: 'app_user', entityId: id, aktion: 'update', alt: alt as any, neu: { email: saved.email, rolle: saved.rolle } as any, userId });
    return { id: saved.id, email: saved.email, rolle: saved.rolle };
  }
}
