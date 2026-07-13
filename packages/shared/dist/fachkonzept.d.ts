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
export declare enum ClientType {
    Privat = "privat",
    Gewerbe = "gewerbe"
}
/** New vs. existing customer. Existing customers never enter a tier (I-20). */
export declare enum StartDeliveryType {
    Neukunde = "neukunde",
    Bestandskunde = "bestandskunde"
}
/** Energy type. Electricity and gas are always separate contracts (I-13/I-15). */
export declare enum TariffEnergyType {
    Strom = "strom",
    Gas = "gas"
}
/** Role of a rep inside an organisation. Overheads flow only via a direct
 * training relationship — no multi-level pyramid (I-04/I-19). */
export declare enum RepRole {
    Sales = "sales",
    Trainer = "trainer",
    TeamLead = "team_lead",
    SiteLead = "site_lead"
}
/** Organisation type (I-04). */
export declare enum OrgType {
    BlitzonDirect = "blitzon_direct",
    Internal = "internal",
    Partner = "partner"
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
export declare function resolveTierRate(count: number, tiers: Tier[]): number;
/** Keys of every versioned business value (I-01, Fachkonzept ch. 16). */
export declare enum ConfigKey {
    QualifyingStatuses = "qualifying_statuses",
    MinConsumptionStrom = "min_consumption_strom",
    MinConsumptionGas = "min_consumption_gas",
    SwaNewCustomerTier = "swa_new_customer_tier",
    EmployeeTier = "employee_tier",
    PartnerTier = "partner_tier",
    Fixum = "fixum",
    EmployerCostRate = "employer_cost_rate",
    OverheadTrainerNew = "overhead_trainer_new",
    OverheadTrainerCommercial = "overhead_trainer_commercial",
    OverheadTeamLeadNew = "overhead_teamlead_new",
    OverheadTeamLeadCommercial = "overhead_teamlead_commercial",
    ExistingCustomerSwaRevenue = "existing_customer_swa_revenue",
    ExistingCustomerEmployeePayout = "existing_customer_employee_payout",
    ExistingCustomerPartnerPayout = "existing_customer_partner_payout",
    CommercialShareEmployeeImmediate = "commercial_share_employee_immediate",
    CommercialShareEmployeeRetention = "commercial_share_employee_retention",
    CommercialSharePartnerImmediate = "commercial_share_partner_immediate",
    CommercialSharePartnerRetention = "commercial_share_partner_retention",
    CommercialSurchargeCapStrom = "commercial_surcharge_cap_strom",
    CommercialSurchargeCapGas = "commercial_surcharge_cap_gas",
    CommercialReserveRate = "commercial_reserve_rate",
    StornoAccountRate = "storno_account_rate",
    StornoProtectionMonths = "storno_protection_months",
    LeadTimeDays = "lead_time_days"
}
/**
 * Default values for the initial config version. Placeholders where the
 * Fachkonzept intermediate values are not yet supplied by BlitzON (the SWA
 * new-customer tier only has its documented anchor points 0–99 €160 …
 * 300+ €205); real rate tables are supplied later without code changes (I-01).
 */
export declare const FACHKONZEPT_DEFAULTS: Record<ConfigKey, unknown>;
/** A single versioned config entry (I-01). */
export interface ConfigVersion {
    key: string;
    value: unknown;
    gueltigAb: string;
}
/**
 * Resolve a config value as-of a reference date: the entry with the latest
 * `gueltigAb` that is not after `asOf`. Recomputing a closed month always uses
 * the version that was valid then (I-01, Fachkonzept ch. 16).
 */
export declare function resolveConfig<T = unknown>(entries: ConfigVersion[], key: string, asOf: string): T | undefined;
