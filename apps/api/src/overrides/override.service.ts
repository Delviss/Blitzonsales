import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contract } from '../entities/contract.entity';
import { ManualOverride } from '../entities/manual-override.entity';
import { LedgerService } from '../config-store/ledger.service';
import { AuditService } from '../audit/audit.service';

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown): number | null => (v == null ? null : Number(v));

export interface OverrideInput {
  /** the corrected SWA commission value that should be booked. */
  neuWert: number;
  /** mandatory reason (rejected without one). */
  grund: string;
  /** optional supporting document reference. */
  dokument?: string | null;
}

export interface OverrideView {
  contractId: string;
  swaOrderNumber: string | null;
  /** the original SWA value — always visible, never hidden (ch. 12.2). */
  originalSwa: number | null;
  /** the current effective (overridden) booking value. */
  effektiverWert: number | null;
  overrides: ManualOverride[];
}

/**
 * Manual overrides + audit trail (I-36, Fachkonzept ch. 12.2 / 12.1).
 *
 * A correction is Founder/Backoffice-only (enforced at the controller). It sets
 * the contract's `manueller_override` (the booking value the run uses, I-36 →
 * engine) while leaving the original SWA value in place, and records a fully
 * reconstructable append-only trail: a `manual_override` row (actor / timestamp
 * / old / new / reason / document), an offsetting `correction` financial ledger
 * entry, and an audit-log entry.
 */
@Injectable()
export class OverrideService {
  constructor(
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
    @InjectRepository(ManualOverride) private readonly overrideRepo: Repository<ManualOverride>,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  /** The original SWA value that must always stay visible (never the override). */
  private static originalSwaOf(ct: Contract): number | null {
    return num(ct.tatsaechlicheSwaProvision) ?? num(ct.swaGesamtprovision);
  }

  /** The value the booking currently uses (override wins, else the original). */
  private static effectiveOf(ct: Contract): number | null {
    return num(ct.manuellerOverride) ?? OverrideService.originalSwaOf(ct);
  }

  async overrideContractSwa(contractId: string, input: OverrideInput, userId: string): Promise<OverrideView> {
    const ct = await this.contractRepo.findOne({ where: { id: contractId } });
    if (!ct) throw new NotFoundException('Vertrag nicht gefunden.');
    const neu = num(input?.neuWert);
    if (neu == null || !Number.isFinite(neu)) throw new BadRequestException('Ein neuer Wert ist erforderlich.');
    const grund = (input?.grund ?? '').trim();
    if (!grund) throw new BadRequestException('Eine Begründung ist für jede manuelle Korrektur erforderlich.');

    const original = OverrideService.originalSwaOf(ct);
    const alt = OverrideService.effectiveOf(ct);
    const neuWert = round2(neu);

    // Set only the override — the original SWA value stays on the contract.
    ct.manuellerOverride = neuWert;
    await this.contractRepo.save(ct);

    const record = await this.overrideRepo.save(
      this.overrideRepo.create({
        entity: 'contract',
        entityId: contractId,
        contractId,
        feld: 'swa_provision',
        altWert: alt,
        neuWert,
        originalSwa: original,
        grund,
        dokument: (input?.dokument ?? '').trim() || null,
        akteur: userId,
      }),
    );

    // Append-only ledger correction (the delta against the previous effective
    // value), referencing the original capture month + SWA order number.
    const monat = (ct.erfassungsdatum ?? '').slice(0, 7) || null;
    await this.ledger.appendFinancial({
      contractId,
      swaOrderNumber: ct.swaOrderNumber ?? null,
      monat,
      typ: 'correction',
      betrag: round2(neuWert - (alt ?? 0)),
      quelle: 'manual',
      akteur: userId,
      begruendung: `Manuelle Korrektur SWA-Provision: ${alt ?? '—'} → ${neuWert}. ${grund}`,
    });

    await this.audit.log({
      entity: 'contract',
      entityId: contractId,
      aktion: 'manueller_override',
      alt: { manuellerOverride: alt, originalSwa: original } as any,
      neu: { manuellerOverride: neuWert, grund, dokument: record.dokument } as any,
      userId,
    });

    return this.view(contractId);
  }

  async view(contractId: string): Promise<OverrideView> {
    const ct = await this.contractRepo.findOne({ where: { id: contractId } });
    if (!ct) throw new NotFoundException('Vertrag nicht gefunden.');
    const overrides = await this.overrideRepo.find({
      where: { contractId },
      order: { createdAt: 'DESC' },
    });
    return {
      contractId,
      swaOrderNumber: ct.swaOrderNumber ?? null,
      originalSwa: OverrideService.originalSwaOf(ct),
      effektiverWert: OverrideService.effectiveOf(ct),
      overrides,
    };
  }
}
