import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organisation } from '../entities/organisation.entity';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class OrganisationsService {
  constructor(
    @InjectRepository(Organisation)
    private readonly repo: Repository<Organisation>,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  findOne(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  async create(data: Partial<Organisation>, userId: string) {
    const org = this.repo.create(data);
    const saved = await this.repo.save(org);
    await this.audit.log({ entity: 'organisation', entityId: saved.id, aktion: 'create', neu: saved as any, userId });
    return saved;
  }

  async update(id: string, data: Partial<Organisation>, userId: string) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException();
    const alt = { ...existing };
    Object.assign(existing, data);
    const saved = await this.repo.save(existing);
    await this.audit.log({ entity: 'organisation', entityId: id, aktion: 'update', alt: alt as any, neu: saved as any, userId });
    return saved;
  }

  async remove(id: string, userId: string) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException();
    await this.repo.remove(existing);
    await this.audit.log({ entity: 'organisation', entityId: id, aktion: 'delete', alt: existing as any, userId });
  }
}
