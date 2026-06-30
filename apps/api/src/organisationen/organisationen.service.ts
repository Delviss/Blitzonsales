import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organisation } from './organisation.entity';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class OrganisationenService {
  constructor(
    @InjectRepository(Organisation)
    private readonly repo: Repository<Organisation>,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.repo.find({ relations: ['children'] });
  }

  findOne(id: string) {
    return this.repo.findOne({ where: { id }, relations: ['children', 'parent'] });
  }

  async create(data: Partial<Organisation>, userId: string) {
    const org = this.repo.create(data);
    const saved = await this.repo.save(org);
    await this.audit.log('organisation', saved.id, 'CREATE', null, saved as Record<string, unknown>, userId);
    return saved;
  }

  async update(id: string, data: Partial<Organisation>, userId: string) {
    const existing = await this.repo.findOneOrFail({ where: { id } });
    const updated = await this.repo.save({ ...existing, ...data });
    await this.audit.log('organisation', id, 'UPDATE', existing as Record<string, unknown>, updated as Record<string, unknown>, userId);
    return updated;
  }

  async remove(id: string, userId: string) {
    const existing = await this.repo.findOneOrFail({ where: { id } });
    await this.repo.delete(id);
    await this.audit.log('organisation', id, 'DELETE', existing as Record<string, unknown>, null, userId);
  }
}
