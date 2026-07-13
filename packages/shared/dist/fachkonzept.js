"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FACHKONZEPT_DEFAULTS = exports.ConfigKey = exports.OrgType = exports.RepRole = exports.TariffEnergyType = exports.StartDeliveryType = exports.ClientType = void 0;
exports.resolveTierRate = resolveTierRate;
exports.resolveConfig = resolveConfig;
/** Private vs. commercial (Gewerbe) customer. Drives which engine applies. */
var ClientType;
(function (ClientType) {
    ClientType["Privat"] = "privat";
    ClientType["Gewerbe"] = "gewerbe";
})(ClientType || (exports.ClientType = ClientType = {}));
/** New vs. existing customer. Existing customers never enter a tier (I-20). */
var StartDeliveryType;
(function (StartDeliveryType) {
    StartDeliveryType["Neukunde"] = "neukunde";
    StartDeliveryType["Bestandskunde"] = "bestandskunde";
})(StartDeliveryType || (exports.StartDeliveryType = StartDeliveryType = {}));
/** Energy type. Electricity and gas are always separate contracts (I-13/I-15). */
var TariffEnergyType;
(function (TariffEnergyType) {
    TariffEnergyType["Strom"] = "strom";
    TariffEnergyType["Gas"] = "gas";
})(TariffEnergyType || (exports.TariffEnergyType = TariffEnergyType = {}));
/** Role of a rep inside an organisation. Overheads flow only via a direct
 * training relationship — no multi-level pyramid (I-04/I-19). */
var RepRole;
(function (RepRole) {
    RepRole["Sales"] = "sales";
    RepRole["Trainer"] = "trainer";
    RepRole["TeamLead"] = "team_lead";
    RepRole["SiteLead"] = "site_lead";
})(RepRole || (exports.RepRole = RepRole = {}));
/** Organisation type (I-04). */
var OrgType;
(function (OrgType) {
    OrgType["BlitzonDirect"] = "blitzon_direct";
    OrgType["Internal"] = "internal";
    OrgType["Partner"] = "partner";
})(OrgType || (exports.OrgType = OrgType = {}));
/**
 * Resolve the retroactive per-contract rate for a monthly count against a tier
 * table. Because tiers are retroactive, the rate for the highest reached
 * threshold applies to *every* contract of that month (I-14/I-15).
 */
function resolveTierRate(count, tiers) {
    const sorted = [...tiers].sort((a, b) => a.abCount - b.abCount);
    let rate = 0;
    for (const t of sorted) {
        if (count >= t.abCount)
            rate = t.satz;
    }
    return rate;
}
/** Keys of every versioned business value (I-01, Fachkonzept ch. 16). */
var ConfigKey;
(function (ConfigKey) {
    ConfigKey["MinConsumptionStrom"] = "min_consumption_strom";
    ConfigKey["MinConsumptionGas"] = "min_consumption_gas";
    ConfigKey["SwaNewCustomerTier"] = "swa_new_customer_tier";
    ConfigKey["EmployeeTier"] = "employee_tier";
    ConfigKey["PartnerTier"] = "partner_tier";
    ConfigKey["Fixum"] = "fixum";
    ConfigKey["EmployerCostRate"] = "employer_cost_rate";
    ConfigKey["OverheadTrainerNew"] = "overhead_trainer_new";
    ConfigKey["OverheadTrainerCommercial"] = "overhead_trainer_commercial";
    ConfigKey["OverheadTeamLeadNew"] = "overhead_teamlead_new";
    ConfigKey["OverheadTeamLeadCommercial"] = "overhead_teamlead_commercial";
    ConfigKey["ExistingCustomerSwaRevenue"] = "existing_customer_swa_revenue";
    ConfigKey["ExistingCustomerEmployeePayout"] = "existing_customer_employee_payout";
    ConfigKey["ExistingCustomerPartnerPayout"] = "existing_customer_partner_payout";
    ConfigKey["CommercialShareEmployeeImmediate"] = "commercial_share_employee_immediate";
    ConfigKey["CommercialShareEmployeeRetention"] = "commercial_share_employee_retention";
    ConfigKey["CommercialSharePartnerImmediate"] = "commercial_share_partner_immediate";
    ConfigKey["CommercialSharePartnerRetention"] = "commercial_share_partner_retention";
    ConfigKey["CommercialSurchargeCapStrom"] = "commercial_surcharge_cap_strom";
    ConfigKey["CommercialSurchargeCapGas"] = "commercial_surcharge_cap_gas";
    ConfigKey["CommercialReserveRate"] = "commercial_reserve_rate";
    ConfigKey["StornoAccountRate"] = "storno_account_rate";
    ConfigKey["StornoProtectionMonths"] = "storno_protection_months";
    ConfigKey["LeadTimeDays"] = "lead_time_days";
    /**
     * General existing-customer pre-contract-end lead time in months (I-33,
     * Fachkonzept ch. 5.3). Prepared as a system parameter only — Phase 1 fixes
     * no value (default `null`), so nothing in the engines assumes a number.
     */
    ConfigKey["ExistingCustomerLeadTimeMonths"] = "existing_customer_lead_time_months";
})(ConfigKey || (exports.ConfigKey = ConfigKey = {}));
/**
 * Default values for the initial config version. Placeholders where the
 * Fachkonzept intermediate values are not yet supplied by BlitzON (the SWA
 * new-customer tier only has its documented anchor points 0–99 €160 …
 * 300+ €205); real rate tables are supplied later without code changes (I-01).
 */
exports.FACHKONZEPT_DEFAULTS = {
    [ConfigKey.MinConsumptionStrom]: 1000,
    [ConfigKey.MinConsumptionGas]: 4000,
    // Only the two documented anchors are authoritative; intermediate steps are
    // placeholders pending the real SWA tier table.
    [ConfigKey.SwaNewCustomerTier]: [
        { abCount: 0, satz: 160 },
        { abCount: 100, satz: 175 },
        { abCount: 200, satz: 190 },
        { abCount: 300, satz: 205 },
    ],
    [ConfigKey.EmployeeTier]: [
        { abCount: 0, satz: 70 },
        { abCount: 40, satz: 90 },
        { abCount: 80, satz: 100 },
    ],
    [ConfigKey.PartnerTier]: [
        { abCount: 0, satz: 90 },
        { abCount: 40, satz: 120 },
        { abCount: 80, satz: 140 },
        { abCount: 120, satz: 150 },
    ],
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
/**
 * Resolve a config value as-of a reference date: the entry with the latest
 * `gueltigAb` that is not after `asOf`. Recomputing a closed month always uses
 * the version that was valid then (I-01, Fachkonzept ch. 16).
 */
function resolveConfig(entries, key, asOf) {
    const applicable = entries
        .filter((e) => e.key === key && e.gueltigAb <= asOf)
        .sort((a, b) => a.gueltigAb.localeCompare(b.gueltigAb));
    if (applicable.length === 0)
        return undefined;
    return applicable[applicable.length - 1].value;
}
