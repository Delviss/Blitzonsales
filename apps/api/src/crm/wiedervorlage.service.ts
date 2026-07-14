import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { ConfigKey, Rolle } from '@blitzon/shared';
import { Wiedervorlage } from '../entities/wiedervorlage.entity';
import { AppUser } from '../entities/app-user.entity';
import { BusinessConfigService } from '../config-store/business-config.service';
import { AuditService } from '../audit/audit.service';
import { EMAIL_SENDER, EmailSender } from './email-sender';
import { evaluateLeadTime, LeadTimeResult } from './lead-time';

/** The input a caller supplies to evaluate an intake for the lead-time rule. */
export interface IntakeInput {
  intakeDate?: string | null;
  vorvertragEnde?: string | null;
  requestedDeliveryStart?: string | null;
  contractId?: string | null;
  swaOrderNumber?: string | null;
  kunde?: string | null;
}

export interface IntakeEvaluation extends LeadTimeResult {
  /** The intake date the rule was evaluated against (defaults to today). */
  intakeDate: string;
  /** The Wiedervorlage created on a breach (I-32), if any. */
  wiedervorlage: Wiedervorlage | null;
}

const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * CRM follow-up service (I-31/I-32, Fachkonzept ch. 5.3 / 13 / 17).
 *
 * Evaluates a contract intake against the configurable lead-time rule (I-01,
 * `ConfigKey.LeadTimeDays`, default 365). On a breach it records the SWA
 * rejection reason "Vorlaufzeit zu lang" and schedules a Wiedervorlage for the
 * first admissible intake day. A separate due-processor emails Founder/Backoffice
 * on that day (or later, when the processor runs) so the contract can be
 * re-taken within the lead time.
 */
@Injectable()
export class WiedervorlageService {
  constructor(
    @InjectRepository(Wiedervorlage) private readonly repo: Repository<Wiedervorlage>,
    @InjectRepository(AppUser) private readonly userRepo: Repository<AppUser>,
    private readonly config: BusinessConfigService,
    private readonly audit: AuditService,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
  ) {}

  /** Resolve the configured lead time as-of a reference date (default 365). */
  async leadTimeDays(asOf: string): Promise<number> {
    const v = await this.config.resolve<number>(ConfigKey.LeadTimeDays, asOf);
    return v ?? 365;
  }

  /**
   * Evaluate an intake (I-31). On a lead-time breach a Wiedervorlage is created
   * for the first admissible day (I-32); an admissible intake creates nothing.
   */
  async evaluateIntake(input: IntakeInput, userId: string | null): Promise<IntakeEvaluation> {
    const intakeDate = input.intakeDate || today();
    const leadTimeDays = await this.leadTimeDays(intakeDate);
    const result = evaluateLeadTime({
      intakeDate,
      vorvertragEnde: input.vorvertragEnde,
      requestedDeliveryStart: input.requestedDeliveryStart,
      leadTimeDays,
    });

    let wiedervorlage: Wiedervorlage | null = null;
    if (!result.admissible && result.firstAdmissibleDate) {
      wiedervorlage = await this.createFollowUp(input, intakeDate, result, userId);
    }
    return { ...result, intakeDate, wiedervorlage };
  }

  private async createFollowUp(
    input: IntakeInput,
    intakeDate: string,
    result: LeadTimeResult,
    userId: string | null,
  ): Promise<Wiedervorlage> {
    // Avoid duplicating an open follow-up for the same contract/order + due date.
    const existing = await this.repo.findOne({
      where: {
        contractId: input.contractId ?? undefined,
        swaOrderNumber: input.swaOrderNumber ?? undefined,
        faelligAm: result.firstAdmissibleDate!,
        status: 'offen',
      },
    });
    if (existing) return existing;

    const row = this.repo.create({
      contractId: input.contractId ?? null,
      swaOrderNumber: input.swaOrderNumber ?? null,
      kunde: input.kunde ?? null,
      vorvertragEnde: input.vorvertragEnde ?? null,
      lieferStart: result.deliveryStart,
      abgelehntAm: intakeDate,
      faelligAm: result.firstAdmissibleDate!,
      grund: result.rejectionReason ?? 'Vorlaufzeit zu lang',
      status: 'offen',
      erstelltVon: userId,
    });
    const saved = await this.repo.save(row);
    await this.audit.log({
      entity: 'wiedervorlage',
      entityId: saved.id,
      aktion: 'create',
      neu: saved as any,
      userId: userId ?? 'system',
    });
    return saved;
  }

  findAll(status?: string): Promise<Wiedervorlage[]> {
    const where = status ? { status } : {};
    return this.repo.find({ where, order: { faelligAm: 'ASC' } });
  }

  /**
   * Dispatch the notification email for every follow-up that is due (`faellig_am`
   * on or before `asOf`) and still open, then mark it `benachrichtigt`. Returns
   * the number of emails sent. Idempotent: an already-notified follow-up is
   * skipped, so re-running the processor never double-sends.
   */
  async processDue(asOf: string, userId: string | null): Promise<{ gesendet: number; faellige: number }> {
    const due = await this.repo.find({
      where: { status: 'offen', faelligAm: LessThanOrEqual(asOf) },
      order: { faelligAm: 'ASC' },
    });
    const recipients = await this.recipients();
    let gesendet = 0;
    for (const w of due) {
      const mail = await this.email.send({
        to: recipients,
        subject: `Wiedervorlage: ${w.kunde ?? w.swaOrderNumber ?? 'Vertrag'} – erneute Aufnahme möglich`,
        body: this.emailBody(w),
        anlass: 'wiedervorlage',
        referenzId: w.id,
      });
      w.status = 'benachrichtigt';
      w.emailGesendetAm = mail.gesendetAm ?? new Date();
      await this.repo.save(w);
      await this.audit.log({
        entity: 'wiedervorlage',
        entityId: w.id,
        aktion: 'benachrichtigt',
        neu: { empfaenger: recipients, emailId: mail.id } as any,
        userId: userId ?? 'system',
      });
      gesendet += 1;
    }
    return { gesendet, faellige: due.length };
  }

  /** Mark a follow-up done (the contract was re-taken or dropped). */
  async resolve(id: string, userId: string): Promise<Wiedervorlage> {
    const w = await this.repo.findOne({ where: { id } });
    if (!w) throw new NotFoundException();
    w.status = 'erledigt';
    const saved = await this.repo.save(w);
    await this.audit.log({ entity: 'wiedervorlage', entityId: id, aktion: 'erledigt', neu: saved as any, userId });
    return saved;
  }

  private emailBody(w: Wiedervorlage): string {
    return [
      `Die Aufnahme des Vertrags ${w.kunde ?? ''} (${w.swaOrderNumber ?? 'ohne Auftragsnummer'}) wurde am`,
      `${w.abgelehntAm ?? 'unbekannt'} mit dem Grund "${w.grund}" abgelehnt.`,
      ``,
      `Ab heute (${w.faelligAm}) liegt der Vorvertrag innerhalb der zulässigen Vorlaufzeit und der`,
      `Vertrag kann erneut aufgenommen werden.`,
      ``,
      `Vorvertrag-Ende: ${w.vorvertragEnde ?? '—'} · Lieferbeginn: ${w.lieferStart ?? '—'}`,
    ].join('\n');
  }

  /**
   * Recipient list: an explicit env override (`WIEDERVORLAGE_EMAIL_RECIPIENTS`,
   * comma-separated) wins; otherwise every Founder/Backoffice user's email.
   */
  private async recipients(): Promise<string[]> {
    const env = process.env.WIEDERVORLAGE_EMAIL_RECIPIENTS;
    if (env && env.trim()) return env.split(',').map((s) => s.trim()).filter(Boolean);
    const users = await this.userRepo.find();
    const mails = users
      .filter((u) => u.rolle === Rolle.AdminGf || u.rolle === Rolle.Backoffice)
      .map((u) => u.email);
    return mails.length ? mails : ['founder@blitzon.de'];
  }
}
