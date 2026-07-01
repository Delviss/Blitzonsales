import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommissionRule } from '../entities/commission-rule.entity';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CommissionRulesService {
  constructor(
    @InjectRepository(CommissionRule) private readonly repo: Repository<CommissionRule>,
    private readonly audit: AuditService,
  ) {}

  findAll(organisationId?: string) {
    const where = organisationId ? { organisationId } : {};
    return this.repo.find({ where, relations: ['organisation', 'produkt'], order: { gueltigAb: 'DESC' } });
  }

  findOne(id: string) {
    return this.repo.findOne({ where: { id }, relations: ['organisation', 'produkt'] });
  }

  async create(data: Partial<CommissionRule>, userId: string) {
    const rule = this.repo.create(data);
    const saved = await this.repo.save(rule);
    await this.audit.log({ entity: 'commission_rule', entityId: saved.id, aktion: 'create', neu: saved as any, userId });
    return saved;
  }

  async update(id: string, data: Partial<CommissionRule>, userId: string) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException();
    const alt = { ...existing };
    Object.assign(existing, data);
    const saved = await this.repo.save(existing);
    await this.audit.log({ entity: 'commission_rule', entityId: id, aktion: 'update', alt: alt as any, neu: saved as any, userId });
    return saved;
  }

  async remove(id: string, userId: string) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException();
    await this.repo.remove(existing);
    await this.audit.log({ entity: 'commission_rule', entityId: id, aktion: 'delete', alt: existing as any, userId });
  }
}
