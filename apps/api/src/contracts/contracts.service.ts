import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rolle } from '@blitzon/shared';
import { Contract } from '../entities/contract.entity';
import { RequestingUser, contractScopeWhere } from '../common/rbac-scope';

export { RequestingUser };

@Injectable()
export class ContractsService {
  constructor(@InjectRepository(Contract) private readonly repo: Repository<Contract>) {}

  /**
   * Aussendienst always sees only their own contracts (repId query is ignored, not just
   * defaulted, so a rep cannot request a colleague's data). Teamleiter is confined to
   * their own organisation. Admin/Backoffice see everything and may filter by repId.
   */
  findAll(user: RequestingUser, repIdParam?: string) {
    const extra = repIdParam && user.rolle !== Rolle.Aussendienst ? { repId: repIdParam } : {};
    return this.repo.find({
      where: contractScopeWhere(user, extra),
      relations: ['rep', 'produkt', 'organisation'],
      order: { joulesId: 'ASC' },
      take: 200,
    });
  }

  async findOne(id: string, user: RequestingUser) {
    const contract = await this.repo.findOne({ where: { id }, relations: ['rep', 'produkt', 'organisation'] });
    if (!contract) return null;
    if (user.rolle === Rolle.Aussendienst && contract.repId !== user.repId) return null;
    if (user.rolle === Rolle.Teamleiter && contract.organisationId !== user.organisationId) return null;
    return contract;
  }
}
