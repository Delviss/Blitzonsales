import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { AppUser } from '../entities/app-user.entity';
import { SalesRep } from '../entities/sales-rep.entity';
import { Contract } from '../entities/contract.entity';
import { CommissionLine } from '../entities/commission-line.entity';
import { AuditService } from '../audit/audit.service';

export interface PersonalDataExport {
  benutzer: { id: string; email: string; rolle: string; organisationId: string | null; twofaEnabled: boolean };
  verkaeufer: { id: string; name: string; iban: string | null; organisationId: string | null } | null;
  vertraege: Contract[];
  provisionszeilen: CommissionLine[];
}

@Injectable()
export class DatenschutzService {
  constructor(
    @InjectRepository(AppUser) private readonly users: Repository<AppUser>,
    @InjectRepository(SalesRep) private readonly reps: Repository<SalesRep>,
    @InjectRepository(Contract) private readonly contracts: Repository<Contract>,
    @InjectRepository(CommissionLine) private readonly lines: Repository<CommissionLine>,
    private readonly audit: AuditService,
  ) {}

  /** DSGVO Art. 15 (right of access): a JSON export of everything personally tied to this login. */
  async exportPersonalData(userId: string): Promise<PersonalDataExport> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException();

    let verkaeufer: PersonalDataExport['verkaeufer'] = null;
    let vertraege: Contract[] = [];
    let provisionszeilen: CommissionLine[] = [];
    if (user.repId) {
      const rep = await this.reps.findOne({ where: { id: user.repId } });
      verkaeufer = rep ? { id: rep.id, name: rep.name, iban: rep.iban, organisationId: rep.organisationId } : null;
      vertraege = await this.contracts.find({ where: { repId: user.repId } });
      provisionszeilen = await this.lines.find({ where: { repId: user.repId }, relations: ['run'] });
    }

    return {
      benutzer: { id: user.id, email: user.email, rolle: user.rolle, organisationId: user.organisationId, twofaEnabled: user.twofaEnabled },
      verkaeufer,
      vertraege,
      provisionszeilen,
    };
  }

  /**
   * DSGVO Art. 17 (right to erasure) balanced against German commercial/tax retention
   * duties (HGB/AO, ~10 years) for accounting records: personal identifiers on the
   * login and the linked sales rep are pseudonymized so the person can no longer be
   * identified, but contract and commission_line rows are left untouched: they stay
   * attached to the now-anonymous rep so historical accounting totals never change.
   */
  async requestErasure(userId: string, requestingUserId: string): Promise<{ status: string; hinweis: string }> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException();

    const alt = { email: user.email, repId: user.repId };
    const placeholderEmail = `geloescht-${user.id}@blitzon.invalid`;
    user.email = placeholderEmail;
    user.password = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
    user.twofaSecret = null;
    user.twofaEnabled = false;
    await this.users.save(user);

    if (user.repId) {
      const rep = await this.reps.findOne({ where: { id: user.repId } });
      if (rep) {
        rep.name = 'Ehemaliger Verkäufer (anonymisiert)';
        rep.iban = null;
        rep.aktiv = false;
        await this.reps.save(rep);
      }
    }

    await this.audit.log({
      entity: 'app_user',
      entityId: userId,
      aktion: 'loeschantrag',
      alt: alt as any,
      neu: { email: placeholderEmail } as any,
      userId: requestingUserId,
    });

    return {
      status: 'pseudonymisiert',
      hinweis: 'Personenbezogene Daten wurden entfernt. Vertrags- und Provisionsdatensätze bleiben aus ' +
        'buchhalterischen Aufbewahrungspflichten (HGB/AO) erhalten und referenzieren nun einen anonymisierten Verkäufer.',
    };
  }
}
