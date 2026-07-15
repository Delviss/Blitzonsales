import { VertragStatus } from '@blitzon/shared';
import { mapJoulesClient } from './joules-mapper';
import {
  JoulesCancellation,
  JoulesClient,
  decodeClientType,
  decodeEnergyType,
  decodeStartDeliveryType,
  flattenClientIds,
  periodToMonths,
} from './joules-schemas';

/** A realistic nested ClientSchema payload per doc.yaml (commercial, Strom). */
const client: JoulesClient = {
  contractData: {
    id: 264122,
    hash_id: 'a1b2c3',
    contract_nr: 'JC-2026-1001',
    order_id: 'SWG0264122',
    client_type: 1, // Commercial
    client_type_label: 'Commercial',
    status: 5,
    status_label: 'In Belieferung',
    confirmed_delivery_start: '2026-07-01',
    confirmed_delivery_end: '2028-06-30',
    tariff_contract_period: '24',
    tariff_contract_period_units: '1', // months
    exported: '2026-05-16 10:15:30',
  },
  salesData: { organization_id: 7, user_id: 341 },
  productData: {
    pricing_date: '2026-05-15',
    tariff_energy_type: 1, // Electricity
    previous_volume: 120000,
    rate_extra_profit_provision: 4,
    rate_extra_profit_provision_gp: null,
    tariff_id: 'swa Strom Fest24 DV',
  },
  switchData: {
    start_delivery_type: 1, // supplier change → Neukunde
    start_delivery: '2026-07-02',
    self_terminated_date: '2026-06-30',
  },
  customerData: { name1: 'Muster GmbH' },
  locationData: { zip: '86150', city: 'Augsburg', street: 'Maximilianstr.', street_number: '1' },
};

describe('mapJoulesClient', () => {
  it('maps the nested ClientSchema onto our upsert record', () => {
    const rec = mapJoulesClient(client, {
      consumptions: [{ consumption: 118000, end_date: '2026-06-30' }],
      repName: 'Sean Tyler Kreuzer',
      orgName: 'Team Augsburg',
    });
    expect(rec.view.swaOrderNumber).toBe('SWG0264122'); // order_id, not contract_nr
    expect(rec.view.joulesId).toBe('264122');
    expect(rec.view.repName).toBe('Sean Tyler Kreuzer');
    expect(rec.orgName).toBe('Team Augsburg');
    expect(rec.view.clientType).toBe('gewerbe');
    expect(rec.view.surchargeCt).toBe(4);
    expect(rec.produktName).toBe('swa Strom Fest24 DV');
    expect(rec.contract.previousVolume).toBe(120000);
    expect(rec.contract.laufzeitMonate).toBe(24);
    expect(rec.contract.verbrauch).toBe(118000);
    expect(rec.contract.kunde).toBe('Muster GmbH');
    expect(rec.contract.strHsnr).toBe('Maximilianstr. 1');
    expect(rec.contract.erfassungsdatum).toBe('2026-05-15'); // pricing_date proxy
    expect(rec.contract.lieferbeginn).toBe('2026-07-01'); // confirmed wins over switchData
    expect(rec.contract.vorvertragEnde).toBe('2026-06-30');
    expect(rec.contract.vertragEnde).toBe('2028-06-30');
    expect(rec.contract.startDeliveryType).toBe('neukunde');
    expect(rec.contract.tariffEnergyType).toBe('strom');
    expect(rec.status).toBe(VertragStatus.InBelieferung);
  });

  it('never invents SWA money figures — the API carries none (I-12 stays the source)', () => {
    const rec = mapJoulesClient(client, {});
    expect(rec.view.actualSwa).toBeNull();
    expect(rec.contract.swaGesamtprovision).toBeUndefined();
    expect(rec.contract.swaZahlbetrag).toBeUndefined();
    expect(rec.contract.tatsaechlicheSwaProvision).toBeUndefined();
  });

  it('takes the gas surcharge (GP) for a gas contract', () => {
    const gas = mapJoulesClient({
      ...client,
      productData: {
        ...client.productData,
        tariff_energy_type: 0, // Gas
        rate_extra_profit_provision: null,
        rate_extra_profit_provision_gp: '2',
      },
    });
    expect(gas.view.surchargeCt).toBe(2);
    expect(gas.contract.tariffEnergyType).toBe('gas');
    expect(gas.contract.rateExtraProfitProvisionGp).toBe(2);
  });

  it('converts a contract period in years to months', () => {
    const rec = mapJoulesClient({
      ...client,
      contractData: { ...client.contractData, tariff_contract_period: 2, tariff_contract_period_units: 2 },
    });
    expect(rec.contract.laufzeitMonate).toBe(24);
  });

  it('uses the latest consumption period', () => {
    const rec = mapJoulesClient(client, {
      consumptions: [
        { consumption: 100000, end_date: '2025-06-30' },
        { consumption: 118000, end_date: '2026-06-30' },
        { consumption: 90000, end_date: '2024-06-30' },
      ],
    });
    expect(rec.contract.verbrauch).toBe(118000);
  });

  it('overrides status to Storno only for an approved/done cancellation', () => {
    const open: JoulesCancellation = { status: 'open', desired_cancellation_date: '2026-08-01' };
    const notYet = mapJoulesClient(client, { cancellations: [open] });
    expect(notYet.status).toBe(VertragStatus.InBelieferung);
    expect(notYet.contract.stornoDatum).toBeNull();

    const approved: JoulesCancellation = { status: 'approved', approved_date: '2026-08-01' };
    const rec = mapJoulesClient(client, { cancellations: [open, approved] });
    expect(rec.status).toBe(VertragStatus.Storno);
    expect(rec.view.status).toBe(VertragStatus.Storno);
    expect(rec.contract.stornoDatum).toBe('2026-08-01');
  });

  it('maps a private client with first/last name and existing-customer switch type', () => {
    const rec = mapJoulesClient({
      ...client,
      contractData: { ...client.contractData, client_type: 0 },
      customerData: { first_name: 'Max', last_name: 'Muster' },
      switchData: { start_delivery_type: 2 },
    });
    expect(rec.view.clientType).toBe('privat');
    expect(rec.contract.kunde).toBe('Max Muster');
    expect(rec.contract.startDeliveryType).toBe('bestandskunde');
  });

  it('falls back to Datencheck for an unknown status label', () => {
    const rec = mapJoulesClient({
      ...client,
      contractData: { ...client.contractData, status_label: 'Etwas Unbekanntes' },
    });
    expect(rec.status).toBe(VertragStatus.Datencheck);
  });

  it('falls back to contract_nr when order_id is missing', () => {
    const rec = mapJoulesClient({
      ...client,
      contractData: { ...client.contractData, order_id: null },
    });
    expect(rec.view.swaOrderNumber).toBe('JC-2026-1001');
  });
});

describe('schema decoders', () => {
  it('flattens the documented nested id-list response (and legacy shapes)', () => {
    expect(
      flattenClientIds([
        [{ id: 1, contract_nr: 'JC1' }, { id: 2 }],
        [{ id: 2 }, { hash_id: 'h3' }],
      ]),
    ).toEqual(['1', '2', 'h3']);
    expect(flattenClientIds([{ id: 7 }])).toEqual(['7']);
    expect(flattenClientIds(['a', 'b'])).toEqual(['a', 'b']);
    expect(flattenClientIds({ ids: [1, 2] })).toEqual(['1', '2']);
  });

  it('decodes the integer enums; WEG/Industry keep distinct labels', () => {
    expect(decodeClientType(0)).toBe('privat');
    expect(decodeClientType('1')).toBe('gewerbe');
    expect(decodeClientType(2)).toBe('weg');
    expect(decodeClientType(4)).toBe('industry');
    expect(decodeClientType(null, 'Commercial')).toBe('commercial');
    expect(decodeEnergyType(1)).toBe('strom');
    expect(decodeEnergyType(0)).toBe('gas');
    expect(decodeEnergyType(10)).toBe('addon');
    expect(decodeStartDeliveryType(0)).toBe('neukunde');
    expect(decodeStartDeliveryType(2)).toBe('bestandskunde');
  });

  it('converts only month/year periods; other units gate as missing term', () => {
    expect(periodToMonths('24', '1')).toBe(24);
    expect(periodToMonths(2, 2)).toBe(24);
    expect(periodToMonths(52, 0)).toBeNull(); // weeks
    expect(periodToMonths('2027-01-01', 3)).toBeNull(); // fixed date
  });
});
