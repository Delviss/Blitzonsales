import { TariffEnergyType, VertragStatus } from '@blitzon/shared';
import { Contract } from '../entities/contract.entity';
import { resolveStatus } from '../import/import-normalizer';
import { UpsertRecord } from '../ingestion/contract-upsert.service';
import { IngestionRecordView } from '../ingestion/ingestion-validation';
import {
  JoulesCancellation,
  JoulesClient,
  JoulesConsumption,
  decodeClientType,
  decodeEnergyType,
  decodeStartDeliveryType,
  isEffectiveCancellation,
  periodToMonths,
} from './joules-schemas';

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

/** Joined non-empty parts ("Maximilianstr." + "1" → "Maximilianstr. 1"). */
function joinParts(...parts: Array<string | null>): string | null {
  const s = parts.filter((p): p is string => !!p).join(' ').trim();
  return s === '' ? null : s;
}

/**
 * Everything the sync resolves *around* the client payload before mapping:
 * the endpoint returns arrays for consumption/cancellation, and the payload
 * carries only `user_id`/`organization_id` — the sync resolves those to names
 * via `GET /user/{id}` / `GET /organizations/{id}` (our master data matches on
 * names, I-11) and passes them in here so the mapper stays pure.
 */
export interface MapJoulesContext {
  consumptions?: JoulesConsumption[] | null;
  cancellations?: JoulesCancellation[] | null;
  /** Rep name resolved from salesData.user_id (null ⇒ gates as unknown rep). */
  repName?: string | null;
  /** Org name resolved from salesData.organization_id. */
  orgName?: string | null;
}

/**
 * Pure field mapper from the real nested Joules ClientSchema (doc.yaml:
 * contractData / salesData / productData / switchData / customerData /
 * locationData) to our source-agnostic upsert record (I-08). No I/O — the sync
 * service does the fetching, the id→name lookups and the upsert; this only
 * translates the shapes, so it is fully unit-testable against sample payloads.
 *
 * - The SWA order number is `contractData.order_id`, falling back to
 *   `contract_nr` (precedence to confirm against the live SWA tenant).
 * - Status classification uses `status_label` (clear text keyed by our status
 *   master, I-06); the integer status id stays available in the raw row.
 * - An *approved/completed* cancellation overrides the status to Storno so a
 *   reversal surfaces immediately (I-09); open/denied/retention ones do not.
 * - The API carries no paid-SWA-commission figures — the settlement-list
 *   import (I-12) remains the source of `tatsaechliche_swa_provision`.
 */
export function mapJoulesClient(client: JoulesClient, ctx: MapJoulesContext = {}): UpsertRecord {
  const cd = client.contractData ?? {};
  const sd = client.salesData ?? {};
  const pd = client.productData ?? {};
  const sw = client.switchData ?? {};
  const cu = client.customerData ?? {};
  const loc = client.locationData ?? cu.address ?? {};

  const swaOrderNumber = str(cd.order_id) ?? str(cd.contract_nr);
  const joulesId = str(cd.id) ?? str(cd.hash_id) ?? swaOrderNumber;

  // Status: clear text via the shared resolver; an effective reversal wins.
  const reversal = (ctx.cancellations ?? []).find(isEffectiveCancellation) ?? null;
  let status: string = resolveStatus(str(cd.status_label));
  if (reversal) status = VertragStatus.Storno;
  const stornoDatum = reversal
    ? isoDate(reversal.approved_date) ??
      isoDate(reversal.desired_cancellation_date) ??
      isoDate(reversal.earliest_possible_date) ??
      isoDate(reversal.created_at)
    : null;

  const clientType = decodeClientType(cd.client_type, str(cd.client_type_label));
  const tariffEnergyType = decodeEnergyType(pd.tariff_energy_type);
  const surchargeStrom = num(pd.rate_extra_profit_provision);
  const surchargeGp = num(pd.rate_extra_profit_provision_gp);

  const previousVolume =
    num(pd.previous_volume) ??
    (num(pd.previous_volume_ht) !== null || num(pd.previous_volume_nt) !== null
      ? (num(pd.previous_volume_ht) ?? 0) + (num(pd.previous_volume_nt) ?? 0)
      : null);
  // Latest consumption period wins; fall back to the contract's previous volume.
  const latestConsumption = [...(ctx.consumptions ?? [])].sort((a, b) =>
    String(a.end_date ?? a.start_date ?? '').localeCompare(String(b.end_date ?? b.start_date ?? '')),
  ).pop();
  const verbrauch = num(latestConsumption?.consumption) ?? previousVolume;

  const laufzeitMonate = periodToMonths(
    (cd.tariff_contract_period as number | string | null) ?? null,
    (cd.tariff_contract_period_units as number | string | null) ?? null,
  );
  const lieferbeginn = isoDate(cd.confirmed_delivery_start) ?? isoDate(sw.start_delivery);

  // Customer display name: commercial name lines, else private first/last name.
  const kunde =
    joinParts(str(cu.name1), str(cu.name2)) ?? joinParts(str(cu.first_name), str(cu.last_name));

  const isGas = tariffEnergyType === TariffEnergyType.Gas;
  const surchargeCt = isGas ? surchargeGp : surchargeStrom;

  const contract: Partial<Contract> = {
    kunde,
    plz: str(loc.zip),
    ort: str(loc.city),
    strHsnr: joinParts(str(loc.street), str(loc.street_number)),
    verbrauch,
    // No creation date in the ClientSchema — pricing_date (the day the price
    // was fixed) is the closest capture-date proxy, else the export timestamp.
    erfassungsdatum: isoDate(pd.pricing_date) ?? isoDate(cd.exported),
    lieferbeginn,
    vorvertragEnde: isoDate(sw.self_terminated_date),
    vertragEnde: isoDate(cd.confirmed_delivery_end) ?? isoDate(cd.contract_termination_date),
    clientType,
    startDeliveryType: decodeStartDeliveryType(sw.start_delivery_type),
    tariffEnergyType,
    rateExtraProfitProvision: surchargeStrom,
    rateExtraProfitProvisionGp: surchargeGp,
    previousVolume,
    laufzeitMonate,
    // swaGesamtprovision / swaZahlbetrag / tatsaechlicheSwaProvision are NOT
    // set: the Joules API exposes no paid-commission figures (see schemas doc
    // comment) — the settlement-list import (I-12) stays the money source.
    stornoDatum,
  };

  const repName = str(ctx.repName) ?? null;
  const orgName = str(ctx.orgName) ?? null;

  const view: IngestionRecordView = {
    swaOrderNumber,
    joulesId,
    repName,
    orgName,
    clientType,
    status,
    surchargeCt,
    laufzeitMonate,
    gesamtverbrauch: previousVolume ?? verbrauch,
    expectedSwa: null,
    actualSwa: null,
  };

  return {
    view,
    contract,
    repName,
    produktName: str(pd.tariff_id) ?? str(pd.rate_id),
    orgName,
    status,
    rohzeile: client as Record<string, unknown>,
  };
}
