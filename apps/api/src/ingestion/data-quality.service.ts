import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IngestionErrorKategorie } from '@blitzon/shared';
import { IngestionError } from '../entities/ingestion-error.entity';
import { SyncRun } from '../entities/sync-run.entity';
import { Contract } from '../entities/contract.entity';

/**
 * The data-quality view (I-11, Fachkonzept ch. 11.1). Surfaces the last sync,
 * the open error rows, the unknown reps / organisations and the unassignable
 * orders, plus the count of contracts currently gated from automatic booking.
 */
@Injectable()
export class DataQualityService {
  constructor(
    @InjectRepository(IngestionError) private readonly errorRepo: Repository<IngestionError>,
    @InjectRepository(SyncRun) private readonly syncRepo: Repository<SyncRun>,
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
  ) {}

  async overview() {
    const [lastSync, openErrors, gesperrteVertraege] = await Promise.all([
      this.syncRepo.findOne({ where: {}, order: { gestartetAm: 'DESC' } }),
      this.errorRepo.find({ where: { behoben: false }, order: { createdAt: 'DESC' }, take: 500 }),
      this.contractRepo.count({ where: { datenqualitaetGesperrt: true } }),
    ]);

    const nachKategorie: Record<string, number> = {};
    const repNames = new Set<string>();
    const orgNames = new Set<string>();
    const nichtZuordenbar: { swaOrderNumber: string | null; joulesId: string | null; grund: string }[] = [];

    for (const e of openErrors) {
      nachKategorie[e.kategorie] = (nachKategorie[e.kategorie] ?? 0) + 1;
      if (e.kategorie === IngestionErrorKategorie.UnknownRep && e.repName) repNames.add(e.repName);
      if (e.kategorie === IngestionErrorKategorie.UnknownOrg && e.orgName) orgNames.add(e.orgName);
      if (
        e.kategorie === IngestionErrorKategorie.Unassignable ||
        e.kategorie === IngestionErrorKategorie.OrderNumberMissing
      ) {
        nichtZuordenbar.push({ swaOrderNumber: e.swaOrderNumber, joulesId: e.joulesId, grund: e.grund });
      }
    }

    return {
      letzteSynchronisierung: lastSync
        ? {
            id: lastSync.id,
            typ: lastSync.typ,
            status: lastSync.status,
            gestartetAm: lastSync.gestartetAm,
            beendetAm: lastSync.beendetAm,
            verarbeitet: lastSync.verarbeitet,
            erstellt: lastSync.erstellt,
            aktualisiert: lastSync.aktualisiert,
            fehler: lastSync.fehler,
            meldung: lastSync.meldung,
          }
        : null,
      offeneFehler: openErrors.length,
      gesperrteVertraege,
      fehlerNachKategorie: nachKategorie,
      unbekannteVerkaeufer: [...repNames],
      unbekannteOrganisationen: [...orgNames],
      nichtZuordenbareAuftraege: nichtZuordenbar,
      fehlerZeilen: openErrors.slice(0, 100).map((e) => ({
        id: e.id,
        quelle: e.quelle,
        swaOrderNumber: e.swaOrderNumber,
        joulesId: e.joulesId,
        repName: e.repName,
        orgName: e.orgName,
        kategorie: e.kategorie,
        feld: e.feld,
        grund: e.grund,
        createdAt: e.createdAt,
      })),
    };
  }
}
