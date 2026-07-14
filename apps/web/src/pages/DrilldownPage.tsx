import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch, formatDate } from '../lib/auth';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import { NetHint, eurNet } from '../components/NetLabels';

type Tab = 'monat' | 'rep' | 'organisation' | 'vertrag' | 'ruecklagen';
const TABS: { key: Tab; label: string }[] = [
  { key: 'monat', label: 'Monat' },
  { key: 'rep', label: 'Verkäufer' },
  { key: 'organisation', label: 'Organisation' },
  { key: 'vertrag', label: 'Vertrag' },
  { key: 'ruecklagen', label: 'Rücklagen' },
];

const currentPeriode = () => new Date().toISOString().slice(0, 7);

/** Traceability chip: every drill-down resolves down to the SWA order number. */
function OrderChip({ nr }: { nr: string | null }) {
  return nr ? <span className="chip bg-brand/10 text-brand border-brand/30 font-mono">{nr}</span> : <span className="text-steel">—</span>;
}

export default function DrilldownPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'monat';
  const id = params.get('id') || '';
  const periode = params.get('periode') || currentPeriode();

  const [reps, setReps] = useState<{ id: string; name: string }[]>([]);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/verkaeufer').then(r => (r.ok ? r.json() : [])).then(setReps).catch(() => {});
    apiFetch('/api/organisationen').then(r => (r.ok ? r.json() : [])).then(setOrgs).catch(() => {});
  }, []);

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next);
  };

  useEffect(() => {
    let path = '';
    if (tab === 'monat') path = `/api/drilldown/monat/${encodeURIComponent(periode)}`;
    else if (tab === 'rep' && id) path = `/api/drilldown/rep/${encodeURIComponent(id)}?periode=${encodeURIComponent(periode)}`;
    else if (tab === 'organisation' && id) path = `/api/drilldown/organisation/${encodeURIComponent(id)}?periode=${encodeURIComponent(periode)}`;
    else if (tab === 'vertrag' && id) path = `/api/drilldown/vertrag/${encodeURIComponent(id)}`;
    else if (tab === 'ruecklagen') path = `/api/drilldown/ruecklagen`;
    if (!path) { setData(null); return; }
    setLoading(true); setError(null);
    apiFetch(path)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Fehler beim Laden des Drilldowns.'))))
      .then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [tab, id, periode]);

  const gotoVertrag = (contractId: string) => set({ tab: 'vertrag', id: contractId });

  const contractCols = [
    { key: 'swaOrderNumber', header: 'SWA-Auftragsnr.', render: (r: any) => <button onClick={() => gotoVertrag(r.contractId)} className="hover:underline"><OrderChip nr={r.swaOrderNumber} /></button> },
    { key: 'kunde', header: 'Kunde', render: (r: any) => r.kunde ?? '—' },
    { key: 'status', header: 'Status', render: (r: any) => <span className="chip bg-navy2 text-steel2 border-line">{r.status}</span> },
    { key: 'tatsaechlicheSwaProvision', header: 'SWA tatsächlich', align: 'right' as const, render: (r: any) => eurNet(r.tatsaechlicheSwaProvision) },
    { key: 'plausibilitaetStatus', header: 'Plausibilität', render: (r: any) => r.plausibilitaetStatus ?? '—' },
  ];

  return (
    <div>
      <PageHeader
        kicker="Drilldown"
        title="Auswertung bis zur Auftragsnummer"
        subtitle="Jede Kennzahl ist bis zur einzelnen SWA-Auftragsnummer nachvollziehbar (I-28, Fachkonzept 11.2/18)."
      />
      <NetHint className="mb-4" />

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {TABS.map(t => (
          <button key={t.key} onClick={() => set({ tab: t.key })} className={`chip ${tab === t.key ? 'bg-brand/15 text-brand border-brand/40' : 'bg-navy2 text-steel2 border-line'}`}>{t.label}</button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {(tab === 'monat' || tab === 'rep' || tab === 'organisation') && (
            <input type="month" value={periode} onChange={e => set({ periode: e.target.value })} className="rounded-lg bg-navy2/60 border border-line px-3 py-2 text-sm text-ink" />
          )}
          {tab === 'rep' && (
            <select value={id} onChange={e => set({ id: e.target.value })} className="rounded-lg bg-navy2/60 border border-line px-3 py-2 text-sm text-ink">
              <option value="">Verkäufer wählen…</option>
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
          {tab === 'organisation' && (
            <select value={id} onChange={e => set({ id: e.target.value })} className="rounded-lg bg-navy2/60 border border-line px-3 py-2 text-sm text-ink">
              <option value="">Organisation wählen…</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          {tab === 'vertrag' && (
            <input value={id} onChange={e => set({ id: e.target.value })} placeholder="Vertrag-ID" className="rounded-lg bg-navy2/60 border border-line px-3 py-2 text-sm text-ink w-64" />
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red mb-4">{error}</p>}
      {loading && <p className="text-sm text-steel mb-4">Lädt…</p>}

      {/* ---- Monat ---- */}
      {tab === 'monat' && data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <Kpi label="Verträge" val={String(data.volumen?.anzahlVertraege ?? 0)} />
            <Kpi label="Fällig gesamt" val={eurNet(data.auszahlungen?.faelligGesamt ?? 0)} tone="text-brand-soft" />
            <Kpi label="SWA erwartet" val={eurNet(data.swaTier?.erwartetGesamt ?? 0)} />
            <Kpi label="SWA tatsächlich" val={eurNet(data.swaTier?.tatsaechlichGesamt ?? 0)} />
          </div>
          {data.korrekturen?.length > 0 && (
            <div className="mb-5"><DataTable title="Korrekturen im Monat" rows={data.korrekturen} columns={[
              { key: 'typ', header: 'Typ' },
              { key: 'swaOrderNumber', header: 'SWA-Auftragsnr.', render: (r: any) => <OrderChip nr={r.swaOrderNumber} /> },
              { key: 'betrag', header: 'Betrag', align: 'right', render: (r: any) => eurNet(r.betrag) },
              { key: 'begruendung', header: 'Grund', render: (r: any) => r.begruendung ?? '—' },
            ]} /></div>
          )}
          <DataTable title="Verträge des Monats" rows={data.vertraege ?? []} columns={contractCols} emptyText="Keine Verträge in dieser Periode." />
        </>
      )}

      {/* ---- Rep ---- */}
      {tab === 'rep' && data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <Kpi label="Qualifizierte Neukunden" val={String(data.qualifizierteNeukunden ?? 0)} />
            <Kpi label="Staffel aktuell" val={eurNet(data.staffelAktuell ?? 0)} tone="text-brand-soft" />
            <Kpi label="Variable Provision" val={eurNet(data.earnings?.variableProvision ?? 0)} />
            <Kpi label="Auszahlung" val={eurNet(data.earnings?.auszahlung ?? 0)} tone={data.earnings?.auszahlungGesperrt ? 'text-amber' : 'text-white'} sub={data.earnings?.auszahlungGesperrt ? 'gesperrt' : undefined} />
            <Kpi label="Bruttolohn-Basis" val={eurNet(data.bruttoGehaltBasis ?? 0)} brutto />
            <Kpi label="Negativsaldo" val={eurNet(data.negativsaldo ?? 0)} tone={(data.negativsaldo ?? 0) > 0 ? 'text-amber' : 'text-white'} />
            <Kpi label="Stornokonto" val={eurNet(data.stornoKonto?.gesamtsaldo ?? 0)} sub={`frei ${eurNet(data.stornoKonto?.freiVerfuegbar ?? 0)}`} />
            <Kpi label="Deckungsbeitrag" val={eurNet(data.deckungsbeitrag ?? 0)} tone="text-green" />
          </div>
          {data.clawbacks?.length > 0 && (
            <div className="mb-5"><DataTable title="Clawbacks" rows={data.clawbacks} columns={[
              { key: 'swaOrderNumber', header: 'SWA-Auftragsnr.', render: (r: any) => <OrderChip nr={r.swaOrderNumber} /> },
              { key: 'passThrough', header: 'Durchgereicht', align: 'right', render: (r: any) => eurNet(r.passThrough) },
              { key: 'remaining', header: 'Offen', align: 'right', render: (r: any) => eurNet(r.remaining) },
              { key: 'inkassoStatus', header: 'Status' },
            ]} /></div>
          )}
          <DataTable title="Verträge des Verkäufers" rows={data.vertraege ?? []} columns={contractCols} emptyText="Keine Verträge." />
        </>
      )}

      {/* ---- Organisation ---- */}
      {tab === 'organisation' && data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
            <Kpi label="Verträge" val={String(data.anzahlVertraege ?? 0)} />
            <Kpi label="SWA-Umsatz" val={eurNet(data.swaUmsatz ?? 0)} tone="text-brand-soft" />
            <Kpi label="Auszahlung" val={eurNet(data.auszahlung ?? 0)} />
            <Kpi label="Gewerbe-Claims" val={eurNet(data.gewerbeClaims ?? 0)} />
            <Kpi label="Storno" val={eurNet(data.storno ?? 0)} />
            <Kpi label="Reserve gebunden" val={eurNet(data.reserveGebunden ?? 0)} />
            <Kpi label="BlitzON-Marge" val={eurNet(data.blitzonMarge ?? 0)} tone="text-green" />
          </div>
          <p className="text-[11px] text-steel mb-5">{data.hinweis}</p>
          <DataTable title="Verträge der Organisation" rows={data.vertraege ?? []} columns={contractCols} emptyText="Keine Verträge." />
        </>
      )}

      {/* ---- Vertrag (leaf) ---- */}
      {tab === 'vertrag' && data && (
        <>
          <div className="card p-5 mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] text-steel uppercase tracking-wider font-semibold">SWA-Auftragsnummer</div>
                <div className="text-2xl font-extrabold text-brand-soft font-mono mt-0.5">{data.swaOrderNumber ?? '—'}</div>
                <div className="text-steel2 text-sm mt-1">{data.kunde ?? '—'} · {data.clientType ?? '—'} · Status {data.status}</div>
              </div>
              <div className="text-right text-[12px] text-steel2">
                <div>Lieferbeginn: {formatDate(data.lieferbeginn)}</div>
                <div>Vertragsende: {formatDate(data.vertragEnde)}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <Kpi label="SWA erwartet" val={eurNet(data.swaRevenue?.erwartet ?? 0)} />
              <Kpi label="SWA tatsächlich" val={eurNet(data.swaRevenue?.tatsaechlich ?? 0)} tone="text-brand-soft" />
              <Kpi label="Abweichung" val={eurNet(data.swaRevenue?.abweichung ?? 0)} />
              <Kpi label="Override" val={data.swaRevenue?.manuellerOverride == null ? '—' : eurNet(data.swaRevenue.manuellerOverride)} tone="text-amber" />
            </div>
          </div>
          <div className="mb-5"><DataTable title="Berechnete Werte (Provisionszeilen)" rows={data.berechneteWerte ?? []} columns={[
            { key: 'periode', header: 'Periode', render: (r: any) => r.periode ?? '—' },
            { key: 'typ', header: 'Typ' },
            { key: 'betrag', header: 'Betrag', align: 'right', render: (r: any) => eurNet(r.betrag) },
            { key: 'runStatus', header: 'Lauf-Status', render: (r: any) => r.runStatus ?? '—' },
            { key: 'begruendung', header: 'Begründung', render: (r: any) => r.begruendung ?? '—' },
          ]} emptyText="Keine berechneten Werte." /></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <DataTable title="Status-Historie" rows={data.statusHistorie ?? []} columns={[
              { key: 'createdAt', header: 'Zeitpunkt', render: (r: any) => formatDate(r.createdAt) },
              { key: 'status', header: 'Status' },
              { key: 'quelle', header: 'Quelle' },
            ]} emptyText="Keine Historie." />
            <DataTable title="Finanz-Historie (Ledger)" rows={data.finanzHistorie ?? []} columns={[
              { key: 'typ', header: 'Typ' },
              { key: 'betrag', header: 'Betrag', align: 'right', render: (r: any) => eurNet(r.betrag) },
              { key: 'monat', header: 'Monat', render: (r: any) => r.monat ?? '—' },
            ]} emptyText="Keine Buchungen." />
          </div>
          {(data.ruecklagen?.length > 0 || data.clawbacks?.length > 0 || data.wiedervorlagen?.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <DataTable title="Rücklagen" rows={data.ruecklagen ?? []} columns={[
                { key: 'periode', header: 'Periode' },
                { key: 'reserveActual', header: 'Ist', align: 'right', render: (r: any) => eurNet(r.reserveActual) },
                { key: 'status', header: 'Status' },
              ]} emptyText="—" />
              <DataTable title="Clawbacks" rows={data.clawbacks ?? []} columns={[
                { key: 'passThrough', header: 'Durchgereicht', align: 'right', render: (r: any) => eurNet(r.passThrough) },
                { key: 'remaining', header: 'Offen', align: 'right', render: (r: any) => eurNet(r.remaining) },
                { key: 'inkassoStatus', header: 'Status' },
              ]} emptyText="—" />
              <DataTable title="Wiedervorlagen" rows={data.wiedervorlagen ?? []} columns={[
                { key: 'faelligAm', header: 'Fällig', render: (r: any) => formatDate(r.faelligAm) },
                { key: 'status', header: 'Status' },
              ]} emptyText="—" />
            </div>
          )}
        </>
      )}

      {/* ---- Rücklagen ---- */}
      {tab === 'ruecklagen' && data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <Kpi label="Stornokonten gesamt" val={eurNet(data.stornokonten?.gesamt?.gesamtsaldo ?? 0)} />
            <Kpi label="Storno frei verfügbar" val={eurNet(data.stornokonten?.gesamt?.freiVerfuegbar ?? 0)} tone="text-green" />
            <Kpi label="Gewerberücklage Ist" val={eurNet(data.gewerbeRuecklagen?.gesamt?.reserveActual ?? 0)} />
            <Kpi label="Unterdeckung" val={eurNet(data.gewerbeRuecklagen?.gesamt?.unterdeckt ?? 0)} tone={(data.gewerbeRuecklagen?.gesamt?.unterdeckt ?? 0) > 0 ? 'text-red' : 'text-white'} />
          </div>
          <div className="mb-5"><DataTable title="Stornokonten pro Person" rows={data.stornokonten?.proPerson ?? []} columns={[
            { key: 'name', header: 'Verkäufer' },
            { key: 'gesamtsaldo', header: 'Saldo', align: 'right', render: (r: any) => eurNet(r.gesamtsaldo) },
            { key: 'privatAnteil', header: 'Privat', align: 'right', render: (r: any) => eurNet(r.privatAnteil) },
            { key: 'gewerbeAnteil', header: 'Gewerbe', align: 'right', render: (r: any) => eurNet(r.gewerbeAnteil) },
            { key: 'offeneForderungen', header: 'Offene Ford.', align: 'right', render: (r: any) => eurNet(r.offeneForderungen) },
            { key: 'freiVerfuegbar', header: 'Frei', align: 'right', render: (r: any) => <span className="text-green">{eurNet(r.freiVerfuegbar)}</span> },
          ]} /></div>
          <DataTable title="Gewerberücklagen pro Vertrag" rows={data.gewerbeRuecklagen?.proVertrag ?? []} columns={[
            { key: 'swaOrderNumber', header: 'SWA-Auftragsnr.', render: (r: any) => <button onClick={() => r.contractId && gotoVertrag(r.contractId)} className="hover:underline"><OrderChip nr={r.swaOrderNumber} /></button> },
            { key: 'periode', header: 'Periode' },
            { key: 'reserveTarget', header: 'Soll', align: 'right', render: (r: any) => eurNet(r.reserveTarget) },
            { key: 'reserveActual', header: 'Ist', align: 'right', render: (r: any) => eurNet(r.reserveActual) },
            { key: 'status', header: 'Status' },
          ]} emptyText="Keine Rücklagen." />
        </>
      )}
    </div>
  );
}

function Kpi({ label, val, tone, sub, brutto }: { label: string; val: string; tone?: string; sub?: string; brutto?: boolean }) {
  return (
    <div className="rounded-xl bg-navy2/60 border border-line px-4 py-3">
      <div className="text-[10.5px] text-steel uppercase tracking-wider font-semibold flex items-center gap-1">
        {label}
        {brutto && <span className="text-amber font-bold">·brutto</span>}
      </div>
      <div className={`text-lg font-extrabold tabular-nums mt-0.5 ${tone ?? 'text-white'}`}>{val}</div>
      {sub && <div className="text-[10.5px] text-steel mt-0.5">{sub}</div>}
    </div>
  );
}
