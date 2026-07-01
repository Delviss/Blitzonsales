import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rolle, RunStatus } from '@blitzon/shared';
import { Contract } from '../entities/contract.entity';
import { CommissionLine } from '../entities/commission-line.entity';
import { SalesRep } from '../entities/sales-rep.entity';
import { Organisation } from '../entities/organisation.entity';
import { Produkt } from '../entities/produkt.entity';
import { RequestingUser, contractScopeWhere } from '../common/rbac-scope';
import { AggregatorLine, AggregatorRep, buildDashboard, DashboardData } from './dashboard-aggregator';

export interface MyLine {
  contractId: string | null;
  joulesId: string | null;
  periode: string;
  runStatus: string;
  betrag: number;
  typ: string;
  begruendung: string | null;
  datencheck: boolean;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
    @InjectRepository(CommissionLine) private readonly lineRepo: Repository<CommissionLine>,
    @InjectRepository(SalesRep) private readonly repRepo: Repository<SalesRep>,
    @InjectRepository(Organisation) private readonly orgRepo: Repository<Organisation>,
    @InjectRepository(Produkt) private readonly produktRepo: Repository<Produkt>,
  ) {}

  async getDashboard(user: RequestingUser): Promise<DashboardData & { myLines?: MyLine[] }> {
    const [contracts, reps, orgs, produkte] = await Promise.all([
      this.contractRepo.find({ where: contractScopeWhere(user) }),
      this.scopedReps(user),
      this.orgRepo.find(),
      this.produktRepo.find(),
    ]);

    const frozenLines = await this.lineRepo.find({
      where: { run: { status: RunStatus.Freigegeben } },
      relations: ['run', 'contract'],
    });
    const scopedFrozenLines = frozenLines.filter(l => this.inScope(user, l.repId, l.contract?.organisationId ?? null));

    const aggregatorLines: AggregatorLine[] = scopedFrozenLines.map(l => ({
      contractId: l.contractId,
      repId: l.repId,
      organisationId: l.contract?.organisationId ?? null,
      produktId: l.contract?.produktId ?? null,
      periode: l.run?.periode ?? '',
      betrag: Number(l.betrag),
      typ: l.typ as 'normal' | 'clawback',
    }));

    const lookups = {
      organisationen: new Map(orgs.map(o => [o.id, o.name])),
      produkte: new Map(produkte.map(p => [p.id, { name: p.name, energie: p.energie }])),
    };
    const aggregatorReps: AggregatorRep[] = reps.map(r => ({ id: r.id, name: r.name, aktiv: r.aktiv }));

    const dashboard = buildDashboard(contracts, aggregatorLines, aggregatorReps, lookups);

    if (user.rolle === Rolle.Aussendienst) {
      const myLines = await this.lineRepo.find({
        where: { repId: user.repId ?? '__none__' },
        relations: ['run', 'contract'],
        order: { id: 'DESC' },
      });
      return {
        ...dashboard,
        myLines: myLines.map(l => ({
          contractId: l.contractId,
          joulesId: l.contract?.joulesId ?? null,
          periode: l.run?.periode ?? '',
          runStatus: l.run?.status ?? '',
          betrag: Number(l.betrag),
          typ: l.typ,
          begruendung: l.begruendung,
          datencheck: l.datencheck,
        })),
      };
    }

    return dashboard;
  }

  private inScope(user: RequestingUser, repId: string | null, organisationId: string | null): boolean {
    if (user.rolle === Rolle.Aussendienst) return repId === user.repId;
    if (user.rolle === Rolle.Teamleiter) return organisationId === user.organisationId;
    return true;
  }

  private scopedReps(user: RequestingUser) {
    if (user.rolle === Rolle.Aussendienst) {
      return this.repRepo.find({ where: { id: user.repId ?? '__none__' } });
    }
    if (user.rolle === Rolle.Teamleiter) {
      return this.repRepo.find({ where: { organisationId: user.organisationId ?? '__none__' } });
    }
    return this.repRepo.find();
  }
}
