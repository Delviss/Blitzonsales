import { ClientType, VertragStatus } from '@blitzon/shared';
import { Contract } from '../entities/contract.entity';
import { resolveStatus } from '../import/import-normalizer';
import { UpsertRecord } from '../ingestion/contract-upsert.service';
import { IngestionRecordView } from '../ingestion/ingestion-validation';
import { JoulesCancellation, JoulesClient, JoulesConsumption } from './joules-schemas';

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function isoDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
}

/**
 * Pure field mapper from the Joules ClientSchema (+ consumption + cancellation)
 * to our source-agnostic upsert record (I-08). No I/O — the sync service does the
 * fetching and the upsert; this only translates the shapes, so it is fully
 * unit-testable against sample payloads.
 *
 * A present-and-cancelled cancellation overrides the status to Storno so a
 * reversal surfaces immediately in the sync (I-09).
 */
export function mapJoulesClient(
  client: JoulesClient,
  consumption?: JoulesConsumption | null,
  cancellation?: JoulesCancellation | null,
): UpsertRecord {
  const swaOrderNumber = str(client.swaOrderNumber) ?? str(client.orderNumber);
  const joulesId = str(client.id) ?? swaOrderNumber;

  const rawStatus = str(client.status);
  let status: string = resolveStatus(rawStatus);
  if (cancellation?.cancelled) {
    status = VertragStatus.Storno;
  }

  const clientType = str(client.clientType);
  const tariffEnergyType = str(client.tariffEnergyType);
  const surchargeStrom = num(client.rateExtraProfitProvision);
  const surchargeGp = num(client.rateExtraProfitProvisionGp);
  const previousVolume = num(client.previousVolume);
  const verbrauch = num(consumption?.annualConsumption) ?? num(consumption?.consumption) ?? previousVolume;
  const laufzeitMonate = num(client.term);
  const swaTotal = num(client.swaTotalCommission);
  const swaPaid = num(client.swaPaidCommission);
  const lieferbeginn = isoDate(consumption?.deliveryStart) ?? isoDate(client.contractStart);

  const isGas = tariffEnergyType === 'gas';
  const surchargeCt = isGas ? surchargeGp : surchargeStrom;

  const contract: Partial<Contract> = {
    kunde: str(client.customerName),
    plz: str(client.zip),
    ort: str(client.city),
    strHsnr: str(client.street),
    verbrauch,
    erfassungsdatum: isoDate(client.createdAt),
    lieferbeginn,
    vorvertragEnde: isoDate(client.preContractEnd),
    vertragEnde: isoDate(client.contractEnd),
    clientType,
    startDeliveryType: str(client.startDeliveryType),
    tariffEnergyType,
    rateExtraProfitProvision: surchargeStrom,
    rateExtraProfitProvisionGp: surchargeGp,
    previousVolume,
    laufzeitMonate,
    swaGesamtprovision: swaTotal,
    swaZahlbetrag: swaPaid,
    tatsaechlicheSwaProvision: swaTotal ?? swaPaid,
    kreditcheckDatum: isoDate(client.creditCheckDate),
    stornoDatum: isoDate(cancellation?.cancellationDate) ?? isoDate(client.cancellationDate),
  };

  const view: IngestionRecordView = {
    swaOrderNumber,
    joulesId,
    repName: str(client.salesRepName),
    orgName: str(client.organizationName),
    clientType: clientType === ClientType.Gewerbe ? ClientType.Gewerbe : clientType === ClientType.Privat ? ClientType.Privat : clientType,
    status,
    surchargeCt,
    laufzeitMonate,
    gesamtverbrauch: previousVolume ?? verbrauch,
    expectedSwa: null,
    actualSwa: swaTotal ?? swaPaid,
  };

  return {
    view,
    contract,
    repName: str(client.salesRepName),
    produktName: str(client.productName),
    orgName: str(client.organizationName),
    status,
    rohzeile: client as Record<string, unknown>,
  };
}
