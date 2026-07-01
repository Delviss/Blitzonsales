import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Produkt } from '../entities/produkt.entity';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ProdukteService {
  constructor(
    @InjectRepository(Produkt) private readonly repo: Repository<Produkt>,
    private readonly audit: AuditService,
  ) {}

  findAll() { return this.repo.find({ order: { name: 'ASC' } }); }
  findOne(id: string) { return this.repo.findOne({ where: { id } }); }

  async create(data: Partial<Produkt>, userId: string) {
    const p = this.repo.create(data);
    const saved = await this.repo.save(p);
    await this.audit.log({ entity: 'produkt', entityId: saved.id, aktion: 'create', neu: saved as any, userId });
    return saved;
  }

  async update(id: string, data: Partial<Produkt>, userId: string) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException();
    const alt = { ...existing };
    Object.assign(existing, data);
    const saved = await this.repo.save(existing);
    await this.audit.log({ entity: 'produkt', entityId: id, aktion: 'update', alt: alt as any, neu: saved as any, userId });
    return saved;
  }
}
