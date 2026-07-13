import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { ImportBatch } from '../entities/import-batch.entity';
import { Contract } from '../entities/contract.entity';
import { SalesRep } from '../entities/sales-rep.entity';
import { Produkt } from '../entities/produkt.entity';
import { AuditService } from '../audit/audit.service';
import { buildHeaderMap, mapRow, normalizeName, resolveStatus } from './import-normalizer';

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

@Injectable()
export class ImportService {
  constructor(
    @InjectRepository(ImportBatch) private readonly batchRepo: Repository<ImportBatch>,
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
    @InjectRepository(SalesRep) private readonly repRepo: Repository<SalesRep>,
    @InjectRepository(Produkt) private readonly produktRepo: Repository<Produkt>,
    private readonly audit: AuditService,
  ) {}

  findBatches() {
    return this.batchRepo.find({ order: { zeitpunkt: 'DESC' }, take: 50, relations: ['importiertVonUser'] });
  }

  async importFile(buffer: Buffer, filename: string, userId: string) {
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

    const headerMap = buildHeaderMap(Object.keys(rows[0]));
    if (!headerMap.has('joulesId')) {
      throw new BadRequestException('Datei enthält keine erkennbare joules_id-Spalte.');
    }

    const [reps, produkte] = await Promise.all([this.repRepo.find(), this.produktRepo.find()]);
    const repByName = new Map(reps.map(r => [normalizeName(r.name), r]));
    const produktByName = new Map(produkte.map(p => [normalizeName(p.name), p]));

    const errors: ImportError[] = [];
    const byJoulesId = new Map<string, ReturnType<typeof mapRow>>();
    rows.forEach((raw, idx) => {
      const normalized = mapRow(raw, headerMap);
      if (!normalized.joulesId) {
        errors.push({ zeile: idx + 2, grund: 'joules_id fehlt, Zeile übersprungen.' });
        return;
      }
      byJoulesId.set(normalized.joulesId, normalized);
    });

    const batch = await this.batchRepo.save(
      this.batchRepo.create({ datei: filename, zeilen: rows.length, importiertVon: userId }),
    );

    let created = 0;
    let updated = 0;
    const importTimestamp = batch.zeitpunkt.toISOString().slice(0, 10);

    for (const row of byJoulesId.values()) {
      const rep = row.repName ? repByName.get(normalizeName(row.repName)) : undefined;
      const produkt = row.produktName ? produktByName.get(normalizeName(row.produktName)) : undefined;
      if (row.repName && !rep) {
        errors.push({ zeile: 0, grund: `Verkäufer "${row.repName}" (Vertrag ${row.joulesId}) ist nicht in den Stammdaten hinterlegt.` });
      }
      if (row.produktName && !produkt) {
        errors.push({ zeile: 0, grund: `Produkt "${row.produktName}" (Vertrag ${row.joulesId}) ist nicht in den Stammdaten hinterlegt.` });
      }

      const existing = await this.contractRepo.findOne({ where: { joulesId: row.joulesId! } });
      const payload: Partial<Contract> = {
        joulesId: row.joulesId!,
        repId: rep?.id ?? existing?.repId ?? null,
        produktId: produkt?.id ?? existing?.produktId ?? null,
        organisationId: rep?.organisationId ?? existing?.organisationId ?? null,
        kunde: row.kunde ?? existing?.kunde ?? null,
        plz: row.plz ?? existing?.plz ?? null,
        ort: row.ort ?? existing?.ort ?? null,
        strHsnr: row.strHsnr ?? existing?.strHsnr ?? null,
        verbrauch: row.verbrauch ?? existing?.verbrauch ?? null,
        // erfassungsdatum missing/serial-0 defaults to the import timestamp (see PROGRESS.md open question)
        erfassungsdatum: row.erfassungsdatum ?? existing?.erfassungsdatum ?? importTimestamp,
        lieferbeginn: row.lieferbeginn ?? existing?.lieferbeginn ?? null,
        // I-33: delivery start (above) and contract end are stored for every contract.
        vertragEnde: row.vertragEnde ?? existing?.vertragEnde ?? null,
        status: resolveStatus(row.status),
        importBatchId: batch.id,
      };

      if (existing) {
        await this.contractRepo.update(existing.id, payload);
        updated += 1;
      } else {
        await this.contractRepo.save(this.contractRepo.create(payload));
        created += 1;
      }
    }

    await this.batchRepo.update(batch.id, { fehler: errors.length ? errors : null });
    await this.audit.log({
      entity: 'import_batch',
      entityId: batch.id,
      aktion: 'import',
      neu: { datei: filename, zeilen: rows.length, erstellt: created, aktualisiert: updated, fehler: errors.length },
      userId,
    });

    return { batchId: batch.id, zeilen: rows.length, erstellt: created, aktualisiert: updated, fehler: errors };
  }
}
