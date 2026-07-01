import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesRep } from '../entities/sales-rep.entity';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SalesRepsService {
  constructor(
    @InjectRepository(SalesRep) private readonly repo: Repository<SalesRep>,
    private readonly audit: AuditService,
  ) {}

  findAll() { return this.repo.find({ relations: ['organisation'], order: { name: 'ASC' } }); }
  findOne(id: string) { return this.repo.findOne({ where: { id }, relations: ['organisation'] }); }

  async create(data: Partial<SalesRep>, userId: string) {
    const rep = this.repo.create(data);
    const saved = await this.repo.save(rep);
    await this.audit.log({ entity: 'sales_rep', entityId: saved.id, aktion: 'create', neu: saved as any, userId });
    return saved;
  }

  async update(id: string, data: Partial<SalesRep>, userId: string) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException();
    const alt = { ...existing };
    Object.assign(existing, data);
    const saved = await this.repo.save(existing);
    await this.audit.log({ entity: 'sales_rep', entityId: id, aktion: 'update', alt: alt as any, neu: saved as any, userId });
    return saved;
  }
}
