/**
 * Domain types and default values for the BlitzON Fachkonzept
 * "Provisions-, Rücklagen- und Steuerungs-Tool" v1.0.
 *
 * Everything here is *default* configuration only. Per Fachkonzept ch. 16
 * (issue I-01) no business value may be hardcoded in the engines — the engines
 * always resolve values from the versioned config store as-of a reference date.
 * These constants seed the initial (valid-from) version of that store and give
 * the pure calculation functions a typed shape to work against.
 */

/** Private vs. commercial (Gewerbe) customer. Drives which engine applies. */
export enum ClientType {
  Privat = 'privat',
  Gewerbe = 'gewerbe',
}

/** New vs. existing customer. Existing customers never enter a tier (I-20). */
export enum StartDeliveryType {
  Neukunde = 'neukunde',
  Bestandskunde = 'bestandskunde',
}

/** Energy type. Electricity and gas are always separate contracts (I-13/I-15). */
export enum TariffEnergyType {
  Strom = 'strom',
  Gas = 'gas',
}

/** Role of a rep inside an organisation. Overheads flow only via a direct
 * training relationship — no multi-level pyramid (I-04/I-19). */
export enum RepRole {
  Sales = 'sales',
  Trainer = 'trainer',
  TeamLead = 'team_lead',
  SiteLead = 'site_lead',
}

/** Organisation type (I-04). */
export enum OrgType {
  BlitzonDirect = 'blitzon_direct',
  Internal = 'internal',
  Partner = 'partner',
}

/**
 * A retroactive volume tier (Staffel): from `abCount` qualified new customers
 * the per-contract rate is `satz`, applied retroactively to the whole month
 * (I-14/I-15). Tiers are stored ascending by `abCount`.
 */
export interface Tier {
  abCount: number;
  satz: number;
}

/**
 * Resolve the retroactive per-contract rate for a monthly count against a tier
 * table. Because tiers are retroactive, the rate for the highest reached
 * threshold applies to *every* contract of that month (I-14/I-15).
 */
export function resolveTierRate(count: number, tiers: Tier[]): number {
  const sorted = [...tiers].sort((a, b) => a.abCount - b.abCount);
  let rate = 0;
  for (const t of sorted) {
    if (count >= t.abCount) rate = t.satz;
  }
  return rate;
}

/** Keys of every versioned business value (I-01, Fachkonzept ch. 16). */
export enum ConfigKey {
  MinConsumptionStrom = 'min_consumption_strom',
  MinConsumptionGas = 'min_consumption_gas',
  SwaNewCustomerTier = 'swa_new_customer_tier',
  EmployeeTier = 'employee_tier',
  PartnerTier = 'partner_tier',
  Fixum = 'fixum',
  EmployerCostRate = 'employer_cost_rate',
  OverheadTrainerNew = 'overhead_trainer_new',
  OverheadTrainerCommercial = 'overhead_trainer_commercial',
  OverheadTeamLeadNew = 'overhead_teamlead_new',
  OverheadTeamLeadCommercial = 'overhead_teamlead_commercial',
  ExistingCustomerSwaRevenue = 'existing_customer_swa_revenue',
  ExistingCustomerEmployeePayout = 'existing_customer_employee_payout',
  ExistingCustomerPartnerPayout = 'existing_customer_partner_payout',
  CommercialShareEmployeeImmediate = 'commercial_share_employee_immediate',
  CommercialShareEmployeeRetention = 'commercial_share_employee_retention',
  CommercialSharePartnerImmediate = 'commercial_share_partner_immediate',
  CommercialSharePartnerRetention = 'commercial_share_partner_retention',
  CommercialSurchargeCapStrom = 'commercial_surcharge_cap_strom',
  CommercialSurchargeCapGas = 'commercial_surcharge_cap_gas',
  CommercialReserveRate = 'commercial_reserve_rate',
  StornoAccountRate = 'storno_account_rate',
  StornoProtectionMonths = 'storno_protection_months',
  LeadTimeDays = 'lead_time_days',
  /**
   * General existing-customer pre-contract-end lead time in months (I-33,
   * Fachkonzept ch. 5.3). Prepared as a system parameter only — Phase 1 fixes
   * no value (default `null`), so nothing in the engines assumes a number.
   */
  ExistingCustomerLeadTimeMonths = 'existing_customer_lead_time_months',
}

/**
 * Default values for the initial config version. Placeholders where the
 * Fachkonzept intermediate values are not yet supplied by BlitzON (the SWA
 * new-customer tier only has its documented anchor points 0–99 €160 …
 * 300+ €205); real rate tables are supplied later without code changes (I-01).
 */
export const FACHKONZEPT_DEFAULTS: Record<ConfigKey, unknown> = {
  [ConfigKey.MinConsumptionStrom]: 1000,
  [ConfigKey.MinConsumptionGas]: 4000,
  // Only the two documented anchors are authoritative; intermediate steps are
  // placeholders pending the real SWA tier table.
  [ConfigKey.SwaNewCustomerTier]: [
    { abCount: 0, satz: 160 },
    { abCount: 100, satz: 175 },
    { abCount: 200, satz: 190 },
    { abCount: 300, satz: 205 },
  ] as Tier[],
  [ConfigKey.EmployeeTier]: [
    { abCount: 0, satz: 70 },
    { abCount: 40, satz: 90 },
    { abCount: 80, satz: 100 },
  ] as Tier[],
  [ConfigKey.PartnerTier]: [
    { abCount: 0, satz: 90 },
    { abCount: 40, satz: 120 },
    { abCount: 80, satz: 140 },
    { abCount: 120, satz: 150 },
  ] as Tier[],
  [ConfigKey.Fixum]: 2116,
  [ConfigKey.EmployerCostRate]: 0.3,
  [ConfigKey.OverheadTrainerNew]: 5,
  [ConfigKey.OverheadTrainerCommercial]: 20,
  [ConfigKey.OverheadTeamLeadNew]: 10,
  [ConfigKey.OverheadTeamLeadCommercial]: 60,
  [ConfigKey.ExistingCustomerSwaRevenue]: 50,
  [ConfigKey.ExistingCustomerEmployeePayout]: 25,
  [ConfigKey.ExistingCustomerPartnerPayout]: 25,
  [ConfigKey.CommercialShareEmployeeImmediate]: 0.25,
  [ConfigKey.CommercialShareEmployeeRetention]: 0.25,
  [ConfigKey.CommercialSharePartnerImmediate]: 0.35,
  [ConfigKey.CommercialSharePartnerRetention]: 0.35,
  [ConfigKey.CommercialSurchargeCapStrom]: 4,
  [ConfigKey.CommercialSurchargeCapGas]: 2,
  [ConfigKey.CommercialReserveRate]: 0.2,
  [ConfigKey.StornoAccountRate]: 0.1,
  [ConfigKey.StornoProtectionMonths]: 6,
  [ConfigKey.LeadTimeDays]: 365,
  // No fixed value in Phase 1 (I-33): the parameter is prepared but unset, so
  // seedDefaults skips it and resolveConfig returns null until BlitzON sets one.
  [ConfigKey.ExistingCustomerLeadTimeMonths]: null,
};

/** A single versioned config entry (I-01). */
export interface ConfigVersion {
  key: string;
  value: unknown;
  gueltigAb: string; // ISO date (YYYY-MM-DD)
}

/**
 * Resolve a config value as-of a reference date: the entry with the latest
 * `gueltigAb` that is not after `asOf`. Recomputing a closed month always uses
 * the version that was valid then (I-01, Fachkonzept ch. 16).
 */
export function resolveConfig<T = unknown>(
  entries: ConfigVersion[],
  key: string,
  asOf: string,
): T | undefined {
  const applicable = entries
    .filter((e) => e.key === key && e.gueltigAb <= asOf)
    .sort((a, b) => a.gueltigAb.localeCompare(b.gueltigAb));
  if (applicable.length === 0) return undefined;
  return applicable[applicable.length - 1].value as T;
}
