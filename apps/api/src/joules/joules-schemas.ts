import { ClientType, StartDeliveryType, TariffEnergyType } from '@blitzon/shared';

/**
 * Typed models for the Joules / SWA RESTful API v2 (I-08, Fachkonzept ch. 12.1).
 *
 * Base URL: https://service.billig-will-ich.de/service/v2 (OpenAPI 3.0).
 * Auth: HTTP Basic *or* an `api-key` request header (either is accepted).
 *
 * These shapes mirror the authoritative `doc.yaml` ("Joules RESTful API v2",
 * einsundnull): a client payload is *nested* — `contractData`, `salesData`,
 * `productData`, `switchData`, `customerData`, `locationData`, … — and most
 * classifying fields are integer enums (`client_type`, `status`,
 * `tariff_energy_type`, `start_delivery_type`), decoded here. Everything stays
 * optional so a partial/unexpected payload maps without throwing; the mapper
 * (`joules-mapper.ts`) is the single place that turns these into our entities.
 *
 * ⚠️ The API carries **no paid SWA commission figures** — the only commission
 * surfaces are `POST /commission/{id}` (create a correction) and the org
 * commission *settings*. The actual SWA Provisionsliste (the booking truth,
 * I-14) therefore keeps coming from the settlement-list import
 * (`POST /api/import/abrechnung`, I-12) even with the API sync live.
 */

// ---------------------------------------------------------------------------
// ClientIdSchema — GET /clients/ids/{status} (status = Joules integer status id)
// ---------------------------------------------------------------------------

/** One entry of the id list (ClientIdSchema). */
export interface JoulesClientId {
  /** Client ID (int64). */
  id?: number | string;
  hash_id?: string;
  /** Client contract number. */
  contract_nr?: string;
  contract_nr_hash?: string;
  [key: string]: unknown;
}

/**
 * The documented response is an array of arrays of ClientIdSchema; tolerate a
 * flat array and legacy `{ids: [...]}` shapes too.
 */
export type JoulesClientIdList =
  | JoulesClientId[][]
  | JoulesClientId[]
  | Array<string | number>
  | { ids?: Array<string | number> };

/** Flatten whatever id-list shape the API returns into unique id strings. */
export function flattenClientIds(payload: JoulesClientIdList): string[] {
  const out = new Set<string>();
  const push = (v: unknown): void => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) {
      v.forEach(push);
      return;
    }
    if (typeof v === 'object') {
      const id = (v as JoulesClientId).id ?? (v as JoulesClientId).hash_id;
      if (id !== undefined && id !== null && String(id).trim() !== '') out.add(String(id));
      return;
    }
    if (String(v).trim() !== '') out.add(String(v));
  };
  if (payload && !Array.isArray(payload) && typeof payload === 'object' && 'ids' in payload) {
    push((payload as { ids?: unknown }).ids);
  } else {
    push(payload);
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// ClientSchema — GET /clients/{id} (nested sections)
// ---------------------------------------------------------------------------

/** ContractDataSchema — ids, status, delivery dates, contract period. */
export interface JoulesContractData {
  /** Contract ID (int64) — the Joules id. */
  id?: number | string;
  hash_id?: string;
  /** Client contract number. */
  contract_nr?: string;
  customer_number?: number | string;
  /** Client type: 0 Private, 1 Commercial, 2 Weg, 4 Industry. */
  client_type?: number | string | null;
  client_type_label?: string | null;
  /** Contract status — Joules integer status id. */
  status?: number | string | null;
  /** Contract status label (the clear text our status master keys on). */
  status_label?: string | null;
  status_message?: string | null;
  /** Contract order ID — the SWA order number (traceability key, I-03/I-28). */
  order_id?: string | null;
  confirmed_delivery_start?: string | null;
  confirmed_delivery_end?: string | null;
  /** Exported date-time ('2023-12-31 10:15:30'). */
  exported?: string | null;
  /** Contract period value; unit in `tariff_contract_period_units`. */
  tariff_contract_period?: number | string | null;
  /** Period units: 0 weeks, 1 months, 2 years, 3 fixed date, 4 days, 5 free input. */
  tariff_contract_period_units?: number | string | null;
  contract_termination_date?: string | null;
  end_contract_reason?: string | null;
  [key: string]: unknown;
}

/** ContractSalesDataSchema — rep/org attribution (ids only, names via lookups). */
export interface JoulesSalesData {
  vp_client_extern_id?: string | null;
  /** Organization ID — resolve the name via GET /organizations/{id}. */
  organization_id?: number | string | null;
  /** User ID (the selling rep) — resolve the name via GET /user/{id}. */
  user_id?: number | string | null;
  partner_id?: number | string | null;
  distribution_channel?: number | string | null;
  [key: string]: unknown;
}

/** ContractProductDataSchema — tariff, consumption, surcharges (Provision AP/GP). */
export interface JoulesProductData {
  pricing_date?: string | null;
  /** 0 Gas, 1 Electricity, 2 Heating, 3 Internet, 4 FeedIn, 5 eMobility, 10 AddOn. */
  tariff_energy_type?: number | string | null;
  /** Consumption (previous volume). */
  previous_volume?: number | string | null;
  previous_volume_ht?: number | string | null;
  previous_volume_nt?: number | string | null;
  /** Base Product ID. */
  rate_id?: number | string | null;
  /** Product ID. */
  tariff_id?: string | null;
  /** Provision AP — the electricity surcharge ct/kWh (I-02/I-21). */
  rate_extra_profit_provision?: number | string | null;
  /** Provision GP — the gas surcharge ct/kWh. */
  rate_extra_profit_provision_gp?: number | string | null;
  rate_ap?: number | string | null;
  rate_gp?: number | string | null;
  bonus_value?: number | string | null;
  [key: string]: unknown;
}

/** ContractSwitchDataSchema — delivery start / previous-contract data. */
export interface JoulesSwitchData {
  /** 0 New move, 1 Change of supplier, 2 Existing Client. */
  start_delivery_type?: number | string | null;
  previous_supplier?: string | null;
  previous_client_number?: string | null;
  start_delivery?: string | null;
  self_terminated?: number | string | null;
  /** Termination date of the previous contract (Vorvertrag-Ende, I-31). */
  self_terminated_date?: string | null;
  move_in_date?: string | null;
  start_delivery_next_possible?: string | null;
  [key: string]: unknown;
}

/** ContractCustomerDataSchema — names (private and commercial variants). */
export interface JoulesCustomerData {
  first_name?: string | null;
  last_name?: string | null;
  /** Commercial name lines. */
  name1?: string | null;
  name2?: string | null;
  organization_type?: string | null;
  ust_id?: string | null;
  address?: JoulesAddressData | null;
  [key: string]: unknown;
}

/** ContractLocationDataSchema / AddressDataSchema — the delivery address. */
export interface JoulesAddressData {
  zip?: string | null;
  city?: string | null;
  country?: string | null;
  street?: string | null;
  street_number?: string | null;
  street_additional?: string | null;
  [key: string]: unknown;
}

/** ClientSchema — the client's contract in Joules (nested sections). */
export interface JoulesClient {
  contractData?: JoulesContractData | null;
  salesData?: JoulesSalesData | null;
  locationData?: JoulesAddressData | null;
  customerData?: JoulesCustomerData | null;
  productData?: JoulesProductData | null;
  switchData?: JoulesSwitchData | null;
  customFields?: Record<string, unknown> | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// ClientStatusSchema — GET /clients/{id}/status
// ---------------------------------------------------------------------------

export interface JoulesClientStatus {
  id?: number | string;
  hash_id?: string;
  /** Joules integer status id. */
  status?: number | string | null;
  /** Status clear text. */
  status_name?: string | null;
  status_message?: string | null;
  status_external_id?: string | null;
  confirmed_delivery_start?: string | null;
  confirmed_delivery_end?: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// ConsumptionSchema — GET /consumption/{id} (returns an array)
// ---------------------------------------------------------------------------

export interface JoulesConsumption {
  joules_id?: number | string;
  contract_nr?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  consumption?: number | string | null;
  receipt_id?: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// CancellationSchema — GET /cancellation/{id} (returns an array)
// ---------------------------------------------------------------------------

export type JoulesCancellationStatus = 'open' | 'denied' | 'retention' | 'approved' | 'cancelled' | 'done';

export interface JoulesCancellation {
  id?: number | string;
  client_id?: number | string;
  /** open | denied | retention | approved | cancelled | done. */
  status?: JoulesCancellationStatus | string | null;
  deny_reason?: string | null;
  reason_id?: number | string | null;
  comment?: string | null;
  type?: 'regular' | 'exceptional' | string | null;
  date_type?: 'next_possible' | 'custom_date' | string | null;
  desired_cancellation_date?: string | null;
  approved_date?: string | null;
  earliest_possible_date?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
}

/** An effective reversal: only an approved/completed cancellation flips the
 * contract to Storno; open/denied/retention/withdrawn ones must not (I-09). */
export function isEffectiveCancellation(c: JoulesCancellation | null | undefined): boolean {
  return c?.status === 'approved' || c?.status === 'done';
}

// ---------------------------------------------------------------------------
// Reference data / lookups
// ---------------------------------------------------------------------------

/** OPTIONS /clients/statuses — the status catalogue (names only, no ids!). */
export interface JoulesStatusOption {
  statusName?: string;
  [key: string]: unknown;
}

/** GET /user/{id} — UserSchema (nested; only userData is relevant here). */
export interface JoulesUser {
  userData?: {
    id?: number | string;
    /** User name (GET only). */
    name?: string | null;
    email?: string | null;
    user_shortname?: string | null;
    role?: string | null;
    organization_id?: number | string | null;
    extern_id?: number | string | null;
    status?: number | string | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

/** GET /organizations/{id} — OrganizationSchema (nested). */
export interface JoulesOrganization {
  organizationData?: {
    id?: number | string;
    /** Organization name (GET only). */
    name?: string | null;
    status?: number | string | null;
    partner_id?: string | null;
    parent_organization?: { id?: string; name?: string } | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

/** The Joules ErrorSchema shape (I-11). */
export interface JoulesError {
  code?: string | number;
  message?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Integer-enum decoders (doc.yaml → Fachkonzept domain values)
// ---------------------------------------------------------------------------

/**
 * client_type: 0 Private, 1 Commercial, 2 Weg, 4 Industry. Only 0/1 map onto
 * the Fachkonzept engines; WEG/Industry keep a distinct label so they surface
 * in the data-quality gate instead of silently running the Gewerbe engine.
 */
export function decodeClientType(v: number | string | null | undefined, label?: string | null): string | null {
  const n = v === null || v === undefined || v === '' ? null : Number(v);
  if (n === 0) return ClientType.Privat;
  if (n === 1) return ClientType.Gewerbe;
  if (n === 2) return 'weg';
  if (n === 4) return 'industry';
  return label ? label.trim().toLowerCase() : null;
}

/** tariff_energy_type: 0 Gas, 1 Electricity; every other product type keeps a
 * distinct label so non-Strom/Gas products surface rather than compute. */
export function decodeEnergyType(v: number | string | null | undefined): string | null {
  const n = v === null || v === undefined || v === '' ? null : Number(v);
  if (n === 0) return TariffEnergyType.Gas;
  if (n === 1) return TariffEnergyType.Strom;
  if (n === 2) return 'heating';
  if (n === 3) return 'internet';
  if (n === 4) return 'feedin';
  if (n === 5) return 'emobility';
  if (n === 10) return 'addon';
  return null;
}

/** start_delivery_type: 0 New move / 1 supplier change → Neukunde; 2 Existing
 * Client → Bestandskunde (I-20: existing customers never enter a tier). */
export function decodeStartDeliveryType(v: number | string | null | undefined): string | null {
  const n = v === null || v === undefined || v === '' ? null : Number(v);
  if (n === 0 || n === 1) return StartDeliveryType.Neukunde;
  if (n === 2) return StartDeliveryType.Bestandskunde;
  return null;
}

/**
 * tariff_contract_period + units → term in months (I-02 Laufzeit).
 * Units: 0 weeks, 1 months, 2 years, 3 fixed date, 4 days, 5 free input —
 * only months/years convert cleanly; anything else yields null so a missing
 * commercial term still gates the record (I-11).
 */
export function periodToMonths(
  period: number | string | null | undefined,
  units: number | string | null | undefined,
): number | null {
  if (period === null || period === undefined || period === '') return null;
  const p = Number(period);
  if (Number.isNaN(p)) return null;
  const u = units === null || units === undefined || units === '' ? null : Number(units);
  if (u === 1) return p;
  if (u === 2) return p * 12;
  return null;
}
