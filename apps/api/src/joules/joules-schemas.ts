/**
 * Typed models for the Joules / SWA RESTful API v2 (I-08, Fachkonzept ch. 12.1).
 *
 * Base URL: https://service.billig-will-ich.de/service/v2 (OpenAPI 3.0).
 * Auth: HTTP Basic *or* an `api-key` request header (either is accepted).
 *
 * ⚠️ The concrete field names mirror the Joules ClientSchema as reflected in the
 * I-02 contract extension (`rate_extra_profit_provision`, `previous_volume`, …).
 * They are best-effort pending the authoritative `doc.yaml` and a test-tenant
 * credential (this issue is externally blocked on that credential). Everything is
 * optional so an unexpected/partial payload maps without throwing; the mapper
 * (`joules-mapper.ts`) is the single place that turns these into our entities.
 */

/** GET /clients/ids/{status} — the id list for a status (delta-sync driver). */
export type JoulesClientIds = string[] | { ids?: string[]; clients?: string[] };

/** GET /clients/{id} — the client / contract (Joules ClientSchema). */
export interface JoulesClient {
  id?: string | number;
  /** The SWA order number — our single traceable key (I-03/I-28). */
  orderNumber?: string | null;
  swaOrderNumber?: string | null;
  /** privat | gewerbe (see ClientType). */
  clientType?: string | null;
  /** neukunde | bestandskunde (see StartDeliveryType). */
  startDeliveryType?: string | null;
  /** strom | gas (see TariffEnergyType). */
  tariffEnergyType?: string | null;
  /** Electricity surcharge ct/kWh. */
  rateExtraProfitProvision?: number | string | null;
  /** Gas surcharge ct/kWh. */
  rateExtraProfitProvisionGp?: number | string | null;
  /** Total / annual consumption. */
  previousVolume?: number | string | null;
  /** Term (Laufzeit) in months. */
  term?: number | string | null;
  contractStart?: string | null;
  contractEnd?: string | null;
  preContractEnd?: string | null;
  /** Total SWA commission for the contract. */
  swaTotalCommission?: number | string | null;
  /** SWA amount actually paid. */
  swaPaidCommission?: number | string | null;
  creditCheckDate?: string | null;
  cancellationDate?: string | null;
  status?: string | null;
  productName?: string | null;
  organizationId?: string | number | null;
  organizationName?: string | null;
  salesRepName?: string | null;
  salesRepId?: string | number | null;
  customerName?: string | null;
  zip?: string | null;
  city?: string | null;
  street?: string | null;
  createdAt?: string | null;
  [key: string]: unknown;
}

/** GET /clients/{id}/status — the current status text. */
export interface JoulesClientStatus {
  status?: string | null;
  statusDate?: string | null;
  [key: string]: unknown;
}

/** GET /consumption/{id} — consumption / usage figures. */
export interface JoulesConsumption {
  clientId?: string | number;
  /** Annual consumption kWh (electricity or gas depending on the contract). */
  annualConsumption?: number | string | null;
  consumption?: number | string | null;
  deliveryStart?: string | null;
  [key: string]: unknown;
}

/** GET /cancellation/{id} — a reversal / cancellation (Widerruf / Storno). */
export interface JoulesCancellation {
  clientId?: string | number;
  cancelled?: boolean;
  cancellationDate?: string | null;
  reason?: string | null;
  /** Any SWA commission clawed back on cancellation. */
  clawbackAmount?: number | string | null;
  [key: string]: unknown;
}

/** GET /organizations/{id}/commissionsettings — partner compensation model. */
export interface JoulesCommissionSettings {
  organizationId?: string | number;
  model?: string | null;
  rates?: Record<string, number>;
  [key: string]: unknown;
}

/** OPTIONS /clients/statuses (reference data) — the status catalogue. */
export interface JoulesStatusOption {
  code?: string;
  label?: string | null;
  [key: string]: unknown;
}

/** The Joules ErrorSchema shape (I-11). */
export interface JoulesError {
  code?: string | number;
  message?: string;
  [key: string]: unknown;
}
