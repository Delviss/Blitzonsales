import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { RunStatus, CLAWBACK_STATUS, Rolle } from '@blitzon/shared';
import { CommissionRun } from '../entities/commission-run.entity';
import { CommissionRule } from '../entities/commission-rule.entity';
import { CommissionLine } from '../entities/commission-line.entity';
import { Contract } from '../entities/contract.entity';
import { AuditService } from '../audit/audit.service';
import { RequestingUser } from '../common/rbac-scope';
import { evaluateClawback, evaluateNewContract } from './commission-engine';
import { getAccountingExporter } from './export/accounting-exporter.registry';
import { buildAbrechnungPdf } from './export/pdf-abrechnung';

const PERIODE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

@Injectable()
export class CommissionRunsService {
  constructor(
    @InjectRepository(CommissionRun) private readonly runRepo: Repository<CommissionRun>,
    @InjectRepository(CommissionRule) private readonly ruleRepo: Repository<CommissionRule>,
    @InjectRepository(CommissionLine) private readonly lineRepo: Repository<CommissionLine>,
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
    private readonly audit: AuditService,
  ) {}

  findAll(organisationId?: string) {
    const where = organisationId ? { organisationId } : {};
    return this.runRepo.find({ where, relations: ['organisation'], order: { periode: 'DESC' } });
  }

  async findOne(id: string) {
    // freigegebenVonUser is intentionally not joined here to avoid leaking the AppUser.password hash
    // into the API response (no ClassSerializerInterceptor/@Exclude is configured project-wide).
    const run = await this.runRepo.findOne({ where: { id }, relations: ['organisation'] });
    if (!run) throw new NotFoundException();
    const lines = await this.lineRepo.find({
      where: { runId: id },
      relations: ['contract', 'contract.organisation', 'rep', 'regel'],
      order: { datencheck: 'DESC', id: 'ASC' },
    });
    const summary = this.summarize(lines);
    return { run, lines, summary };
  }

  private summarize(lines: CommissionLine[]) {
    let gesamt = 0;
    let anzahlDatencheck = 0;
    const proRep = new Map<string, { repId: string; name: string; summe: number }>();
    for (const line of lines) {
      gesamt += Number(line.betrag);
      if (line.datencheck) anzahlDatencheck += 1;
      const repId = line.repId ?? 'unbekannt';
      const name = line.rep?.name ?? 'Unbekannt';
      const entry = proRep.get(repId) ?? { repId, name, summe: 0 };
      entry.summe += Number(line.betrag);
      proRep.set(repId, entry);
    }
    return { gesamt, anzahlZeilen: lines.length, anzahlDatencheck, proRep: Array.from(proRep.values()) };
  }

  async create(data: { periode: string; organisationId?: string | null }, userId: string) {
    if (!data.periode || !PERIODE_RE.test(data.periode)) {
      throw new BadRequestException('periode muss im Format JJJJ-MM angegeben werden.');
    }
    const run = this.runRepo.create({
      periode: data.periode,
      organisationId: data.organisationId ?? null,
      status: RunStatus.Entwurf,
      createdBy: userId,
    });
    const saved = await this.runRepo.save(run);
    await this.audit.log({ entity: 'commission_run', entityId: saved.id, aktion: 'create', neu: saved as any, userId });
    await this.generate(saved.id, userId);
    return this.findOne(saved.id);
  }

  /** (Re-)generates the draft lines for a still-open run. Idempotent, safe to call repeatedly while entwurf. */
  async generate(runId: string, userId: string) {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException();
    if (run.status !== RunStatus.Entwurf) {
      throw new ConflictException('Nur Entwürfe können neu berechnet werden.');
    }

    const previousLines = await this.lineRepo.find({ where: { runId } });
    const clawbacksInDraft = previousLines.filter(l => l.typ === 'clawback');
    for (const clawback of clawbacksInDraft) {
      await this.lineRepo.update({ storniertDurch: clawback.id }, { storniertDurch: null });
    }
    if (previousLines.length > 0) {
      await this.lineRepo.remove(previousLines);
    }

    const rules = await this.ruleRepo.find();
    const engineRules = rules.map(r => ({
      id: r.id,
      typ: r.typ,
      produktId: r.produktId,
      organisationId: r.organisationId,
      gueltigAb: r.gueltigAb,
      gueltigBis: r.gueltigBis,
      satz: r.satz == null ? null : Number(r.satz),
    }));

    const where = run.organisationId ? { organisationId: run.organisationId } : {};
    const contracts = await this.contractRepo.find({ where });

    const newLines: CommissionLine[] = [];
    for (const contract of contracts) {
      const existing = await this.lineRepo.findOne({
        where: { contractId: contract.id, typ: 'normal' },
        order: { id: 'DESC' },
      });

      if (!existing) {
        const result = evaluateNewContract(contract, engineRules);
        newLines.push(
          this.lineRepo.create({
            runId,
            contractId: contract.id,
            repId: contract.repId,
            regelId: result.regelId,
            betrag: result.betrag,
            typ: result.typ,
            begruendung: result.begruendung,
            datencheck: result.datencheck,
          }),
        );
        continue;
      }

      if (!existing.storniertDurch && CLAWBACK_STATUS.has(contract.status as any)) {
        const result = evaluateClawback({ betrag: Number(existing.betrag), regelId: existing.regelId }, contract);
        const clawback = this.lineRepo.create({
          runId,
          contractId: contract.id,
          repId: contract.repId,
          regelId: result.regelId,
          betrag: result.betrag,
          typ: result.typ,
          begruendung: result.begruendung,
          datencheck: result.datencheck,
        });
        newLines.push(clawback);
      }
    }

    const saved = await this.lineRepo.save(newLines);
    for (const line of saved) {
      if (line.typ === 'clawback') {
        await this.lineRepo.update(
          { contractId: line.contractId!, typ: 'normal', storniertDurch: IsNull() },
          { storniertDurch: line.id },
        );
      }
    }
    return this.findOne(runId);
  }

  async freigeben(runId: string, userId: string) {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException();
    if (run.status === RunStatus.Freigegeben) {
      throw new ConflictException('Lauf ist bereits freigegeben.');
    }
    if (run.createdBy && run.createdBy === userId) {
      throw new ConflictException('Vier-Augen-Prinzip: Der Ersteller eines Laufs kann ihn nicht selbst freigeben.');
    }
    const alt = { ...run };
    run.status = RunStatus.Freigegeben;
    run.freigegebenVon = userId;
    run.freigegebenAm = new Date();
    const saved = await this.runRepo.save(run);
    await this.audit.log({ entity: 'commission_run', entityId: runId, aktion: 'freigeben', alt: alt as any, neu: saved as any, userId });
    return this.findOne(runId);
  }

  /** Accounting export via the pluggable AccountingExporter interface (default 'csv', placeholder 'datev'). */
  async exportBuchhaltung(runId: string, format: string, userId: string): Promise<{ filename: string; buffer: Buffer; contentType: string }> {
    const { run, lines } = await this.assertFreigegeben(runId);
    const exporter = getAccountingExporter(format);
    const result = exporter.export(run, lines);
    await this.audit.log({
      entity: 'commission_run',
      entityId: runId,
      aktion: `export_buchhaltung_${exporter.format}`,
      neu: { anzahlZeilen: lines.length, format: exporter.format } as any,
      userId,
    });
    return result;
  }

  async exportIntern(runId: string, userId: string): Promise<{ filename: string; buffer: Buffer }> {
    const { run, lines, summary } = await this.assertFreigegeben(runId);
    const detailRows = lines.map(l => ({
      Vertrag: l.contract?.joulesId ?? '',
      Kunde: l.contract?.kunde ?? '',
      Verkaeufer: l.rep?.name ?? '',
      Organisation: l.contract?.organisation?.name ?? '',
      Typ: l.typ,
      Betrag: Number(l.betrag),
      Begruendung: l.begruendung ?? '',
      Datencheck: l.datencheck ? 'Ja' : 'Nein',
    }));
    const summaryRows = summary.proRep.map(r => ({ Verkaeufer: r.name, Summe: r.summe }));

    const orgTotals = new Map<string, number>();
    for (const l of lines) {
      const name = l.contract?.organisation?.name ?? 'Unbekannt';
      orgTotals.set(name, (orgTotals.get(name) ?? 0) + Number(l.betrag));
    }
    const orgRows = Array.from(orgTotals.entries()).map(([Organisation, Summe]) => ({ Organisation, Summe }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), 'Details');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Je Verkäufer');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orgRows), 'Je Organisation');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    await this.audit.log({
      entity: 'commission_run',
      entityId: runId,
      aktion: 'export_intern',
      neu: { anzahlZeilen: lines.length } as any,
      userId,
    });
    return { filename: `provisionslauf-${run.periode}-${run.id}.xlsx`, buffer };
  }

  /** Per-rep Abrechnungsblatt (PDF). Aussendienst may only export their own; others need org/global access. */
  async exportAbrechnungPdf(runId: string, repId: string, requestingUser: RequestingUser): Promise<{ filename: string; buffer: Buffer }> {
    if (requestingUser.rolle === Rolle.Aussendienst && requestingUser.repId !== repId) {
      throw new ForbiddenException('Zugriff verweigert.');
    }
    const { run, lines } = await this.assertFreigegeben(runId);
    const repLines = lines.filter(l => l.repId === repId);
    if (requestingUser.rolle === Rolle.Teamleiter) {
      const belongsToOrg = repLines.every(l => l.contract?.organisationId === requestingUser.organisationId);
      if (!belongsToOrg) throw new ForbiddenException('Zugriff verweigert.');
    }
    const repName = repLines[0]?.rep?.name ?? 'Unbekannt';
    const buffer = await buildAbrechnungPdf(run, repName, repLines);
    await this.audit.log({
      entity: 'commission_run',
      entityId: runId,
      aktion: 'export_abrechnung_pdf',
      neu: { repId, anzahlZeilen: repLines.length } as any,
      userId: requestingUser.sub,
    });
    return { filename: `abrechnung-${run.periode}-${repName.replace(/\s+/g, '_')}.pdf`, buffer };
  }

  private async assertFreigegeben(runId: string) {
    const result = await this.findOne(runId);
    if (result.run.status !== RunStatus.Freigegeben) {
      throw new ConflictException('Export ist erst nach Freigabe des Laufs möglich.');
    }
    return result;
  }
}
