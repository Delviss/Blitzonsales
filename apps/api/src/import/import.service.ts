import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { IngestionSource } from '@blitzon/shared';
import { ImportBatch } from '../entities/import-batch.entity';
import { Contract } from '../entities/contract.entity';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../config-store/ledger.service';
import { IngestionArchiveService } from '../ingestion/ingestion-archive.service';
import { ContractUpsertService, UpsertRecord } from '../ingestion/contract-upsert.service';
import { IngestionRecordView } from '../ingestion/ingestion-validation';
import {
  buildHeaderMap,
  buildSettlementHeaderMap,
  mapRow,
  mapSettlementRow,
  resolveStatus,
} from './import-normalizer';
import { classifyHistoricalRisk, isAtRisk, RiskContractView } from './historical-migration';

export interface ImportError {
  zeile: number;
  grund: string;
}

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // .xlsx (zip)
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]); // legacy .xls

/** Excel workbooks are read as binary; CSV/plain-text exports are decoded as UTF-8 first so umlauts survive. */
function readWorkbook(buffer: Buffer): XLSX.WorkBook {
  const isBinaryWorkbook = buffer.subarray(0, 4).equals(ZIP_SIGNATURE) || buffer.subarray(0, 4).equals(OLE_SIGNATURE);
  if (isBinaryWorkbook) {
    return XLSX.read(buffer, { type: 'buffer', raw: true });
  }
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  return XLSX.read(text, { type: 'string', raw: true });
}

/**
 * Excel/CSV import (Phase 3) — now the **fallback** and the settlement-list
 * import path for Wave 3 (I-12). Contract imports funnel through the same shared
 * order-number upsert (`ContractUpsertService`) as the Joules sync so both
 * channels archive (I-10), upsert (I-11) and gate identically; the file's raw
 * bytes are archived byte-for-byte before anything is written.
 */
@Injectable()
export class ImportService {
  constructor(
    @InjectRepository(ImportBatch) private readonly batchRepo: Repository<ImportBatch>,
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
    private readonly audit: AuditService,
    private readonly archive: IngestionArchiveService,
    private readonly upsert: ContractUpsertService,
    private readonly ledger: LedgerService,
  ) {}

  findBatches() {
    return this.batchRepo.find({ order: { zeitpunkt: 'DESC' }, take: 50, relations: ['importiertVonUser'] });
  }

  async importFile(buffer: Buffer, filename: string, userId: string) {
    const { rows } = this.parse(buffer);
    const headerMap = buildHeaderMap(Object.keys(rows[0]));
    if (!headerMap.has('joulesId')) {
      throw new BadRequestException('Datei enthält keine erkennbare joules_id-Spalte.');
    }

    // I-10: archive the raw file byte-for-byte before writing anything.
    const archived = await this.archive.archive({
      quelle: IngestionSource.File,
      referenz: filename,
      akteur: userId,
      contentType: this.contentType(buffer, filename),
      rohdaten: buffer,
      satzAnzahl: rows.length,
    });

    const batch = await this.batchRepo.save(
      this.batchRepo.create({ datei: filename, zeilen: rows.length, importiertVon: userId }),
    );
    const importTimestamp = batch.zeitpunkt.toISOString().slice(0, 10);

    // Build the source-agnostic records, keyed and deduplicated on order number.
    const byKey = new Map<string, UpsertRecord>();
    for (const raw of rows) {
      const n = mapRow(raw, headerMap);
      if (!n.joulesId) continue; // no key at all — nothing to upsert
      const status = resolveStatus(n.status);
      const view: IngestionRecordView = {
        // the Joules export id doubles as the SWA order number today
        swaOrderNumber: n.joulesId,
        joulesId: n.joulesId,
        repName: n.repName,
        orgName: null,
        clientType: null,
        status,
        surchargeCt: null,
        laufzeitMonate: null,
        gesamtverbrauch: n.verbrauch,
        expectedSwa: null,
        actualSwa: null,
      };
      const contract: Partial<Contract> = {
        kunde: n.kunde,
        plz: n.plz,
        ort: n.ort,
        strHsnr: n.strHsnr,
        verbrauch: n.verbrauch,
        // erfassungsdatum missing/serial-0 defaults to the import timestamp (open question 1).
        erfassungsdatum: n.erfassungsdatum ?? importTimestamp,
        lieferbeginn: n.lieferbeginn,
        vertragEnde: n.vertragEnde,
      };
      byKey.set(n.joulesId, { view, contract, repName: n.repName, produktName: n.produktName, orgName: null, status, rohzeile: raw });
    }

    const res = await this.upsert.upsertBatch([...byKey.values()], {
      quelle: IngestionSource.File,
      akteur: userId,
      archiveId: archived.id,
    });
    await this.archive.setCounts(archived.id, res.verarbeitet, res.fehlerAnzahl);

    const errors: ImportError[] = res.fehlerListe.map((f) => ({
      zeile: 0,
      grund: `${f.swaOrderNumber ?? f.joulesId ?? '—'}: ${f.grund}`,
    }));
    await this.batchRepo.update(batch.id, { fehler: errors.length ? errors : null });
    await this.audit.log({
      entity: 'import_batch',
      entityId: batch.id,
      aktion: 'import',
      neu: { datei: filename, zeilen: rows.length, erstellt: res.erstellt, aktualisiert: res.aktualisiert, fehler: errors.length, gesperrt: res.gesperrt },
      userId,
    });

    return { batchId: batch.id, zeilen: rows.length, erstellt: res.erstellt, aktualisiert: res.aktualisiert, fehler: errors };
  }

  /**
   * I-12 settlement-list import: the SWA commission list keyed on the SWA order
   * number. It writes the actually-booked commission onto matching contracts
   * (the booking truth for the I-14 plausibility control) and appends an
   * append-only `swa_actual` financial event (I-03). Unmatched order numbers are
   * reported so an operator can reconcile.
   */
  async importSettlement(buffer: Buffer, filename: string, userId: string) {
    const { rows } = this.parse(buffer);
    const headerMap = buildSettlementHeaderMap(Object.keys(rows[0]));
    if (!headerMap.has('swaOrderNumber') || !headerMap.has('swaGesamtprovision')) {
      throw new BadRequestException('Abrechnungsliste benötigt eine Auftragsnummer- und eine Provisionsspalte.');
    }

    const archived = await this.archive.archive({
      quelle: IngestionSource.File,
      referenz: `${filename} (Abrechnungsliste)`,
      akteur: userId,
      contentType: this.contentType(buffer, filename),
      rohdaten: buffer,
      satzAnzahl: rows.length,
      meta: { modus: 'abrechnungsliste' },
    });

    const batch = await this.batchRepo.save(
      this.batchRepo.create({ datei: `${filename} (Abrechnung)`, zeilen: rows.length, importiertVon: userId }),
    );

    const errors: ImportError[] = [];
    let aktualisiert = 0;
    for (let i = 0; i < rows.length; i++) {
      const s = mapSettlementRow(rows[i], headerMap);
      if (!s.swaOrderNumber) {
        errors.push({ zeile: i + 2, grund: 'Zeile ohne Auftragsnummer übersprungen.' });
        continue;
      }
      const contract = await this.findByOrderNumber(s.swaOrderNumber);
      if (!contract) {
        errors.push({ zeile: i + 2, grund: `Auftrag ${s.swaOrderNumber} ist keinem Vertrag zugeordnet.` });
        continue;
      }
      const actual = s.swaGesamtprovision;
      const changed = actual != null && Number(actual) !== Number(contract.tatsaechlicheSwaProvision ?? NaN);
      await this.contractRepo.update(contract.id, {
        swaGesamtprovision: actual ?? contract.swaGesamtprovision,
        swaZahlbetrag: s.swaZahlbetrag ?? contract.swaZahlbetrag,
        tatsaechlicheSwaProvision: actual ?? contract.tatsaechlicheSwaProvision,
      });
      aktualisiert += 1;
      if (changed) {
        await this.ledger.appendFinancial({
          contractId: contract.id,
          swaOrderNumber: s.swaOrderNumber,
          monat: (contract.erfassungsdatum ?? new Date().toISOString().slice(0, 10)).slice(0, 7),
          typ: 'swa_actual',
          betrag: Number(actual),
          quelle: 'import',
          akteur: userId,
          begruendung: 'SWA-Abrechnungsliste',
        });
      }
    }

    await this.archive.setCounts(archived.id, rows.length, errors.length);
    await this.batchRepo.update(batch.id, { fehler: errors.length ? errors : null });
    await this.audit.log({
      entity: 'import_batch',
      entityId: batch.id,
      aktion: 'import_abrechnung',
      neu: { datei: filename, zeilen: rows.length, aktualisiert, fehler: errors.length },
      userId,
    });
    return { batchId: batch.id, zeilen: rows.length, aktualisiert, fehler: errors };
  }

  /**
   * I-12 historical migration report: which of the currently-imported contracts
   * fall into the *required* migration set (still-open / at-risk) versus the
   * archive-only remainder, so go-live can prove the required set reconciles.
   */
  async atRiskReport(referenceDate = new Date().toISOString().slice(0, 10), stornoProtectionMonths = 6) {
    const contracts = await this.contractRepo.find();
    const atRisk = contracts.filter((c) =>
      isAtRisk(this.toRiskView(c, referenceDate, stornoProtectionMonths)),
    );
    return {
      referenceDate,
      gesamt: contracts.length,
      erforderlich: atRisk.length,
      archivierbar: contracts.length - atRisk.length,
      auftraege: atRisk.map((c) => ({
        id: c.id,
        swaOrderNumber: c.swaOrderNumber,
        joulesId: c.joulesId,
        clientType: c.clientType,
        status: c.status,
        gruende: classifyHistoricalRisk(this.toRiskView(c, referenceDate, stornoProtectionMonths)),
      })),
    };
  }

  private toRiskView(c: Contract, referenceDate: string, stornoProtectionMonths: number): RiskContractView {
    return {
      clientType: c.clientType,
      status: c.status,
      referenceDate,
      erfassungsdatum: c.erfassungsdatum,
      lieferbeginn: c.lieferbeginn,
      stornoProtectionMonths,
      swaGesamtprovision: c.swaGesamtprovision != null ? Number(c.swaGesamtprovision) : null,
      swaZahlbetrag: c.swaZahlbetrag != null ? Number(c.swaZahlbetrag) : null,
      // Absent live retention/reserve state on the contract, treat an active
      // commercial contract's retention & reserve as open (conservative).
      reserveOffen: c.clientType === 'gewerbe',
      retentionOffen: c.clientType === 'gewerbe',
      gesamtverbrauch: c.previousVolume != null ? Number(c.previousVolume) : c.verbrauch,
      erwarteterVerbrauch: null,
    };
  }

  private parse(buffer: Buffer): { rows: Record<string, unknown>[] } {
    let workbook: XLSX.WorkBook;
    try {
      workbook = readWorkbook(buffer);
    } catch {
      throw new BadRequestException('Datei konnte nicht gelesen werden. Erwartet wird CSV oder Excel (.xlsx).');
    }
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
    if (rows.length === 0) {
      throw new BadRequestException('Datei enthält keine Zeilen.');
    }
    return { rows };
  }

  private findByOrderNumber(orderNumber: string): Promise<Contract | null> {
    return this.contractRepo
      .findOne({ where: { swaOrderNumber: orderNumber } })
      .then((c) => c ?? this.contractRepo.findOne({ where: { joulesId: orderNumber } }));
  }

  private contentType(buffer: Buffer, filename: string): string {
    const isBinary = buffer.subarray(0, 4).equals(ZIP_SIGNATURE) || buffer.subarray(0, 4).equals(OLE_SIGNATURE);
    if (isBinary) return 'application/vnd.ms-excel';
    return filename.toLowerCase().endsWith('.csv') ? 'text/csv' : 'text/plain';
  }
}
