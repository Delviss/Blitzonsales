import { VertragStatus } from '@blitzon/shared';
import { mapJoulesClient } from './joules-mapper';
import { JoulesCancellation, JoulesClient, JoulesConsumption } from './joules-schemas';

const client: JoulesClient = {
  id: 'SWG0264122',
  orderNumber: 'SWG0264122',
  clientType: 'gewerbe',
  startDeliveryType: 'neukunde',
  tariffEnergyType: 'strom',
  rateExtraProfitProvision: '4',
  rateExtraProfitProvisionGp: null,
  previousVolume: '120000',
  term: 24,
  contractStart: '2026-07-01',
  contractEnd: '2028-06-30',
  swaTotalCommission: '4800',
  swaPaidCommission: '2400',
  creditCheckDate: '2026-05-20T00:00:00Z',
  status: 'In Belieferung',
  productName: 'swa Strom Fest24 DV',
  organizationName: 'Team Augsburg',
  salesRepName: 'Sean Tyler Kreuzer',
  customerName: 'Muster GmbH',
  zip: '86150',
  city: 'Augsburg',
  street: 'Maximilianstr. 1',
  createdAt: '2026-05-15',
};

describe('mapJoulesClient', () => {
  it('maps the ClientSchema onto our upsert record', () => {
    const rec = mapJoulesClient(client, { annualConsumption: '118000' } as JoulesConsumption);
    expect(rec.view.swaOrderNumber).toBe('SWG0264122');
    expect(rec.view.repName).toBe('Sean Tyler Kreuzer');
    expect(rec.view.clientType).toBe('gewerbe');
    expect(rec.view.surchargeCt).toBe(4);
    expect(rec.view.actualSwa).toBe(4800);
    expect(rec.produktName).toBe('swa Strom Fest24 DV');
    expect(rec.contract.previousVolume).toBe(120000);
    expect(rec.contract.laufzeitMonate).toBe(24);
    expect(rec.contract.verbrauch).toBe(118000);
    expect(rec.contract.lieferbeginn).toBe('2026-07-01');
    expect(rec.contract.vertragEnde).toBe('2028-06-30');
    expect(rec.contract.kreditcheckDatum).toBe('2026-05-20');
    expect(rec.status).toBe(VertragStatus.InBelieferung);
  });

  it('takes the gas surcharge for a gas contract', () => {
    const gas = mapJoulesClient({
      ...client,
      tariffEnergyType: 'gas',
      rateExtraProfitProvision: null,
      rateExtraProfitProvisionGp: '2',
    });
    expect(gas.view.surchargeCt).toBe(2);
    expect(gas.contract.rateExtraProfitProvisionGp).toBe(2);
  });

  it('overrides status to Storno when a cancellation is present', () => {
    const cancellation: JoulesCancellation = { cancelled: true, cancellationDate: '2026-08-01', reason: 'Widerruf' };
    const rec = mapJoulesClient(client, null, cancellation);
    expect(rec.status).toBe(VertragStatus.Storno);
    expect(rec.view.status).toBe(VertragStatus.Storno);
    expect(rec.contract.stornoDatum).toBe('2026-08-01');
  });

  it('falls back to Datencheck for an unknown status', () => {
    const rec = mapJoulesClient({ ...client, status: 'Etwas Unbekanntes' });
    expect(rec.status).toBe(VertragStatus.Datencheck);
  });
});
