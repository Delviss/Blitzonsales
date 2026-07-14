import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigKey, IngestionSource } from '@blitzon/shared';
import { Contract } from '../entities/contract.entity';
import { SalesRep } from '../entities/sales-rep.entity';
import { Produkt } from '../entities/produkt.entity';
import { Organisation } from '../entities/organisation.entity';
import { LedgerService } from '../config-store/ledger.service';
import { StatusMasterService } from '../status-master/status-master.service';
import { BusinessConfigService } from '../config-store/business-config.service';
import { normalizeName } from '../import/import-normalizer';
import { classifyRecord, IngestionRecordView, isBlocked } from './ingestion-validation';
import { IngestionErrorService } from './ingestion-error.service';

/**
 * One record to upsert, in the source-agnostic shape both the file import and
 * the Joules sync produce. `contract` carries the writable contract fields the
 * source supplied (nulls are ignored so an update never wipes a known value);
 * the name fields are resolved to master-data ids here.
 */
export interface UpsertRecord {
  view: IngestionRecordView;
  contract: Partial<Contract>;
  repName: string | null;
  produktName: string | null;
  orgName: string | null;
  /** Resolved status text (VertragStatus) to store on the contract. */
  status: string;
  /** The raw delivered record, kept for the data-quality error list. */
  rohzeile: Record<string, unknown>;
}

export interface UpsertFinding {
  swaOrderNumber: string | null;
  joulesId: string | null;
  grund: string;
  sperrend: boolean;
}

export interface UpsertResult {
  verarbeitet: number;
  erstellt: number;
  aktualisiert: number;
  gesperrt: number;
  fehlerAnzahl: number;
  /** Flat list of every finding, so a caller (e.g. the import UI) can show them. */
  fehlerListe: UpsertFinding[];
}

function stripNullish<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/**
 * The single write path for ingested contracts (I-11, Fachkonzept ch. 11.1/12.2).
 * Both channels funnel through here so they behave identically:
 *
 *   • Upsert keyed on the **SWA order number** (falling back to the Joules id),
 *     so a returning order updates the contract as a new version — never a
 *     duplicate.
 *   • Every status change appends an append-only status event (I-03); a changed
 *     actual SWA commission appends a financial event.
 *   • Records that fail a data-quality rule are routed to the error list and the
 *     contract is *gated* (`datenqualitaet_gesperrt`) so it gets no automatic
 *     booking until corrected.
 */
@Injectable()
export class ContractUpsertService {
  constructor(
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
    @InjectRepository(SalesRep) private readonly repRepo: Repository<SalesRep>,
    @InjectRepository(Produkt) private readonly produktRepo: Repository<Produkt>,
    @InjectRepository(Organisation) private readonly orgRepo: Repository<Organisation>,
    private readonly ledger: LedgerService,
    private readonly statusMaster: StatusMasterService,
    private readonly config: BusinessConfigService,
    private readonly errors: IngestionErrorService,
  ) {}

  /**
   * Upsert a batch of records. `quelle` tags the ledger events and error rows;
   * `archiveId` links the flagged records back to their immutable raw copy.
   */
  async upsertBatch(
    records: UpsertRecord[],
    opts: { quelle: IngestionSource | string; akteur: string | null; archiveId?: string | null },
  ): Promise<UpsertResult> {
    const asOf = new Date().toISOString().slice(0, 10);
    const [reps, produkte, orgs, knownStatus, tolerance] = await Promise.all([
      this.repRepo.find(),
      this.produktRepo.find(),
      this.orgRepo.find(),
      this.statusMaster.knownCodes(asOf),
      this.config.resolve<number>(ConfigKey.PlausibilityToleranceAbs, asOf),
    ]);
    const repByName = new Map(reps.map((r) => [normalizeName(r.name), r]));
    const produktByName = new Map(produkte.map((p) => [normalizeName(p.name), p]));
    const orgByName = new Map(orgs.map((o) => [normalizeName(o.name), o]));
    const knownStatusSet = new Set(knownStatus);
    const toleranceAbs = tolerance ?? 1;

    const result: UpsertResult = { verarbeitet: 0, erstellt: 0, aktualisiert: 0, gesperrt: 0, fehlerAnzahl: 0, fehlerListe: [] };

    for (const rec of records) {
      result.verarbeitet += 1;
      const rep = rec.repName ? repByName.get(normalizeName(rec.repName)) : undefined;
      const produkt = rec.produktName ? produktByName.get(normalizeName(rec.produktName)) : undefined;
      const org = rec.orgName ? orgByName.get(normalizeName(rec.orgName)) : undefined;

      // Data-quality classification (I-11) on the resolved record.
      const items = classifyRecord(rec.view, {
        repMatched: !!rep,
        orgMatched: !!org,
        statusKnown: knownStatusSet.has(rec.status),
        toleranceAbs,
      });
      const blocked = isBlocked(items);
      if (items.length > 0) result.fehlerAnzahl += 1;
      for (const it of items) {
        result.fehlerListe.push({
          swaOrderNumber: rec.view.swaOrderNumber,
          joulesId: rec.view.joulesId,
          grund: it.grund,
          sperrend: it.sperrend,
        });
      }

      // Upsert keyed on SWA order number, falling back to the Joules id (I-11).
      const existing = await this.findExisting(rec.view.swaOrderNumber, rec.view.joulesId);

      const provided = stripNullish({ ...rec.contract, status: rec.status });
      const payload: Partial<Contract> = {
        ...provided,
        joulesId: rec.view.joulesId ?? existing?.joulesId ?? rec.view.swaOrderNumber ?? undefined,
        swaOrderNumber: rec.view.swaOrderNumber ?? existing?.swaOrderNumber ?? null,
        repId: rep?.id ?? existing?.repId ?? null,
        produktId: produkt?.id ?? existing?.produktId ?? null,
        organisationId: org?.id ?? rep?.organisationId ?? existing?.organisationId ?? null,
        ingestQuelle: opts.quelle,
        datenqualitaetGesperrt: blocked,
      };

      const monat = (payload.erfassungsdatum ?? existing?.erfassungsdatum ?? asOf).slice(0, 7);
      let contractId: string;
      const statusChanged = !existing || existing.status !== rec.status;
      const actual = rec.view.actualSwa;
      const actualChanged = actual != null && Number(actual) !== Number(existing?.tatsaechlicheSwaProvision ?? NaN);

      if (existing) {
        await this.contractRepo.update(existing.id, payload);
        contractId = existing.id;
        result.aktualisiert += 1;
      } else {
        const saved = await this.contractRepo.save(this.contractRepo.create(payload));
        contractId = saved.id;
        result.erstellt += 1;
      }
      if (blocked) result.gesperrt += 1;

      // Append-only ledger (I-03): a status change is always historied; a changed
      // actual SWA commission posts a financial event. Reversals/status changes
      // therefore surface immediately in the contract history.
      if (statusChanged) {
        await this.ledger.appendStatus({
          contractId,
          swaOrderNumber: rec.view.swaOrderNumber,
          monat,
          status: rec.status,
          quelle: opts.quelle,
          akteur: opts.akteur,
        });
      }
      if (actualChanged) {
        await this.ledger.appendFinancial({
          contractId,
          swaOrderNumber: rec.view.swaOrderNumber,
          monat,
          typ: 'swa_actual',
          betrag: Number(actual),
          quelle: opts.quelle,
          akteur: opts.akteur,
          begruendung: 'Tatsächliche SWA-Provision aus Ingestion',
        });
      }

      // Route findings to the data-quality error list (I-11). Clean records clear
      // any earlier open findings for the same order number.
      await this.errors.record({
        quelle: opts.quelle,
        archiveId: opts.archiveId ?? null,
        record: rec.view,
        items,
        rohzeile: rec.rohzeile,
      });
    }

    return result;
  }

  private findExisting(swaOrderNumber: string | null, joulesId: string | null): Promise<Contract | null> {
    if (swaOrderNumber) {
      return this.contractRepo
        .findOne({ where: { swaOrderNumber } })
        .then((c) => c ?? (joulesId ? this.contractRepo.findOne({ where: { joulesId } }) : null));
    }
    if (joulesId) return this.contractRepo.findOne({ where: { joulesId } });
    return Promise.resolve(null);
  }
}
