import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';

export interface AuditParams {
  entity: string;
  entityId: string | null;
  aktion: string;
  alt?: Record<string, unknown> | null;
  neu?: Record<string, unknown> | null;
  userId?: string | null;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async log(params: AuditParams): Promise<void>;
  async log(
    entity: string,
    entityId: string | null,
    aktion: string,
    alt: Record<string, unknown> | null,
    neu: Record<string, unknown> | null,
    userId: string | null,
  ): Promise<void>;
  async log(
    paramsOrEntity: AuditParams | string,
    entityId?: string | null,
    aktion?: string,
    alt?: Record<string, unknown> | null,
    neu?: Record<string, unknown> | null,
    userId?: string | null,
  ): Promise<void> {
    let p: AuditParams;
    if (typeof paramsOrEntity === 'string') {
      p = { entity: paramsOrEntity, entityId: entityId ?? null, aktion: aktion ?? '', alt, neu, userId };
    } else {
      p = paramsOrEntity;
    }
    const entry = this.repo.create({
      entity: p.entity,
      entityId: p.entityId,
      aktion: p.aktion,
      alt: p.alt ?? null,
      neu: p.neu ?? null,
      userId: p.userId ?? null,
    });
    await this.repo.save(entry);
  }
}
