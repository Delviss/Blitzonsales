import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, apiDownload } from '../lib/auth';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import { NetHint, NettoBadge, BruttolohnBadge, eurNet } from '../components/NetLabels';
import { AlertIcon, DownloadIcon, RefreshIcon } from '../components/icons';

interface Tile { label: string; val: string; sub?: string; tone?: string; badge?: 'netto' | 'brutto' }

interface Kpis {
  periode: string;
  nettoHinweis: string;
  swaUmsatz: { aktuellBestaetigt: number; aktuellErwartet: number; vormonatBestaetigt: number; ytdBestaetigt: number; ytdErwartet: number };
  neukundenTier: { qualifizierteNeukunden: number; erreichteStufe: number; naechsteStufeAb: number | null; naechsteStufeSatz: number | null; anzahlAbweichung: number; anzahlOffen: number };
  angestellte: { anzahl: number; provision: number; nettoAuszahlung: number; bruttoGehaltBasis: number; negativsaldoGesamt: number; arbeitgeberkosten: number; stornoEinbehalt: number; deckungsbeitrag: number };
  partner: { anzahl: number; umsatz: number; nettoAuszahlung: number; offeneRuecklage: number; blitzonMarge: number };
  gewerbe: { anzahl: number; gesamtProvision: number; sofortAnteil: number; ruecklageAnteil: number; reserveTarget: number; reserveActual: number; unterdeckung: number; risiken: number; ersteHaelfteBestaetigt: number; zweiteHaelfteBestaetigt: number };
  freieBetriebsliquiditaet: { wert: number; komponenten: { bestaetigterSwaUmsatz: number; faelligeAuszahlungen: number; arbeitgeberkosten: number; stornoKontoReserviert: number; gebundeneGewerbeRuecklage: number; offeneClawbackForderungen: number } };
  warnungen: { rot: number; gelb: number; info: number };
  datenqualitaet: { gesperrteVertraege: number; offeneFehler: number };
  echtzeit: {
    provisorisch: boolean;
    reversalImpactGesamt: number;
    anzahlReversals: number;
    repTierProjektionen: { repId: string; isPartner: boolean; qualifiedNewCount: number; reachedRate: number; nextThreshold: number | null; bisNaechsteStufe: number | null; potenzialNaechsteStufe: number | null; variableProvision: number }[];
  };
}

const currentPeriode = () => new Date().toISOString().slice(0, 7);

function TileGrid({ title, badge, tiles }: { title: string; badge?: 'netto'; tiles: Tile[] }) {
  return (
    <section className="mb-6">
      <h2 className="text-white font-bold text-sm mb-2.5 flex items-center gap-2">
        {title}
        {badge === 'netto' && <NettoBadge />}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {tiles.map(t => (
          <div key={t.label} className="rounded-xl bg-navy2/60 border border-line px-4 py-3">
            <div className="text-[10.5px] text-steel uppercase tracking-wider font-semibold flex items-center gap-1">
              {t.label}
              {t.badge === 'brutto' && <BruttolohnBadge />}
            </div>
            <div className={`text-lg font-extrabold tabular-nums mt-0.5 ${t.tone ?? 'text-white'}`}>{t.val}</div>
            {t.sub && <div className="text-[10.5px] text-steel mt-0.5">{t.sub}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function KennzahlenPage() {
  const [periode, setPeriode] = useState(currentPeriode());
  const [data, setData] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (p: string) => {
    setLoading(true);
    setError(null);
    apiFetch(`/api/kennzahlen?periode=${encodeURIComponent(p)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Fehler beim Laden der Kennzahlen.'))))
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(periode); /* eslint-disable-next-line */ }, []);

  const exportCsv = () =>
    apiDownload(`/api/kennzahlen/export?periode=${encodeURIComponent(periode)}`, `kennzahlen-${periode}.csv`).catch(e => setError(e.message));

  const liq = data?.freieBetriebsliquiditaet;
  const k = liq?.komponenten;

  return (
    <div>
      <PageHeader
        kicker="Führungskennzahlen"
        title="Founder-Dashboard"
        subtitle="Alle Kennzahlen aus Fachkonzept 11.1 — netto, inkl. freier Betriebsliquidität und Echtzeit-Projektion (I-27/I-30)."
        actions={
          <div className="flex items-center gap-2">
            <input type="month" value={periode} onChange={e => setPeriode(e.target.value)} className="rounded-lg bg-navy2/60 border border-line px-3 py-2 text-sm text-ink" />
            <button onClick={() => load(periode)} disabled={loading} className="btn-primary"><RefreshIcon size={15} />{loading ? 'Lädt…' : 'Aktualisieren'}</button>
            <button onClick={exportCsv} className="btn-ghost"><DownloadIcon size={15} />CSV</button>
          </div>
        }
      />

      <NetHint className="mb-5" />
      {error && <p className="text-sm text-red mb-4">{error}</p>}

      {/* Free operating liquidity — the anchor tile (ch. 11.1 / 18) */}
      <section className="card p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] text-steel uppercase tracking-wider font-semibold flex items-center gap-2">Freie Betriebsliquidität <NettoBadge /></div>
            <div className={`text-4xl font-extrabold tabular-nums mt-1 ${(liq?.wert ?? 0) < 0 ? 'text-red' : 'text-brand-soft'}`}>
              {liq ? eurNet(liq.wert) : '—'}
            </div>
            <p className="text-steel2 text-[12px] mt-1 max-w-md">Bestätigter SWA-Umsatz abzüglich fälliger Auszahlungen, Arbeitgeberkosten, Storno-Puffer, gebundener Gewerberücklagen und offener Clawback-Forderungen. Rücklagen mindern die freie Liquidität (Fachkonzept 18).</p>
          </div>
          {k && (
            <div className="text-[12px] tabular-nums min-w-[280px]">
              <Row label="Bestätigter SWA-Umsatz" val={eurNet(k.bestaetigterSwaUmsatz)} tone="text-green" sign="+" />
              <Row label="Fällige Auszahlungen" val={eurNet(k.faelligeAuszahlungen)} tone="text-red" sign="−" />
              <Row label="Arbeitgeberkosten" val={eurNet(k.arbeitgeberkosten)} tone="text-red" sign="−" />
              <Row label="Storno-Konto reserviert" val={eurNet(k.stornoKontoReserviert)} tone="text-red" sign="−" />
              <Row label="Gebundene Gewerberücklage" val={eurNet(k.gebundeneGewerbeRuecklage)} tone="text-red" sign="−" />
              <Row label="Offene Clawback-Forderungen" val={eurNet(k.offeneClawbackForderungen)} tone="text-red" sign="−" />
              <div className="border-t border-line mt-1.5 pt-1.5 flex items-center justify-between font-bold text-white">
                <span>= Freie Liquidität</span><span>{eurNet(liq!.wert)}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      <TileGrid title="SWA-Umsatz" badge="netto" tiles={[
        { label: 'Aktuell bestätigt', val: eurNet(data?.swaUmsatz.aktuellBestaetigt ?? 0), tone: 'text-brand-soft' },
        { label: 'Aktuell erwartet', val: eurNet(data?.swaUmsatz.aktuellErwartet ?? 0) },
        { label: 'Vormonat bestätigt', val: eurNet(data?.swaUmsatz.vormonatBestaetigt ?? 0) },
        { label: 'YTD bestätigt', val: eurNet(data?.swaUmsatz.ytdBestaetigt ?? 0), sub: `erwartet ${eurNet(data?.swaUmsatz.ytdErwartet ?? 0)}` },
      ]} />

      <TileGrid title="Neukunden & SWA-Staffel" tiles={[
        { label: 'Qualifizierte Neukunden', val: String(data?.neukundenTier.qualifizierteNeukunden ?? 0) },
        { label: 'Erreichte Stufe', val: eurNet(data?.neukundenTier.erreichteStufe ?? 0), tone: 'text-brand-soft', sub: 'pro Vertrag' },
        { label: 'Nächste Stufe ab', val: data?.neukundenTier.naechsteStufeAb != null ? String(data.neukundenTier.naechsteStufeAb) : 'Höchste', sub: data?.neukundenTier.naechsteStufeSatz != null ? eurNet(data.neukundenTier.naechsteStufeSatz) : undefined },
        { label: 'SWA-Abweichungen', val: String(data?.neukundenTier.anzahlAbweichung ?? 0), tone: (data?.neukundenTier.anzahlAbweichung ?? 0) > 0 ? 'text-amber' : 'text-white', sub: `${data?.neukundenTier.anzahlOffen ?? 0} offen` },
      ]} />

      <TileGrid title="Interne Angestellte" badge="netto" tiles={[
        { label: 'Provision', val: eurNet(data?.angestellte.provision ?? 0) },
        { label: 'Netto-Auszahlung', val: eurNet(data?.angestellte.nettoAuszahlung ?? 0), tone: 'text-brand-soft' },
        { label: 'Gehaltsbasis', val: eurNet(data?.angestellte.bruttoGehaltBasis ?? 0), badge: 'brutto', sub: `${data?.angestellte.anzahl ?? 0} Angestellte` },
        { label: 'Negativsaldo gesamt', val: eurNet(data?.angestellte.negativsaldoGesamt ?? 0), tone: (data?.angestellte.negativsaldoGesamt ?? 0) > 0 ? 'text-amber' : 'text-white' },
        { label: 'Arbeitgeberkosten', val: eurNet(data?.angestellte.arbeitgeberkosten ?? 0) },
        { label: 'Storno-Einbehalt', val: eurNet(data?.angestellte.stornoEinbehalt ?? 0) },
        { label: 'Deckungsbeitrag', val: eurNet(data?.angestellte.deckungsbeitrag ?? 0), tone: 'text-green' },
      ]} />

      <TileGrid title="Partner" badge="netto" tiles={[
        { label: 'Umsatz', val: eurNet(data?.partner.umsatz ?? 0), sub: `${data?.partner.anzahl ?? 0} Partner` },
        { label: 'Netto-Auszahlung', val: eurNet(data?.partner.nettoAuszahlung ?? 0), tone: 'text-brand-soft' },
        { label: 'Offene Rücklage', val: eurNet(data?.partner.offeneRuecklage ?? 0) },
        { label: 'BlitzON-Marge', val: eurNet(data?.partner.blitzonMarge ?? 0), tone: 'text-green' },
      ]} />

      <TileGrid title="Gewerbe" badge="netto" tiles={[
        { label: 'Gesamtprovision', val: eurNet(data?.gewerbe.gesamtProvision ?? 0), sub: `${data?.gewerbe.anzahl ?? 0} Verträge` },
        { label: 'Sofortanteil (fällig)', val: eurNet(data?.gewerbe.sofortAnteil ?? 0), tone: 'text-brand-soft' },
        { label: 'Rücklageanteil', val: eurNet(data?.gewerbe.ruecklageAnteil ?? 0), sub: 'nicht fällig' },
        { label: 'SWA-Hälften bestätigt', val: `${data?.gewerbe.ersteHaelfteBestaetigt ?? 0} / ${data?.gewerbe.zweiteHaelfteBestaetigt ?? 0}`, sub: '1. / 2. Hälfte' },
        { label: 'Reserve Soll', val: eurNet(data?.gewerbe.reserveTarget ?? 0) },
        { label: 'Reserve Ist', val: eurNet(data?.gewerbe.reserveActual ?? 0) },
        { label: 'Unterdeckung', val: eurNet(data?.gewerbe.unterdeckung ?? 0), tone: (data?.gewerbe.unterdeckung ?? 0) > 0 ? 'text-red' : 'text-white' },
        { label: 'Risiken', val: String(data?.gewerbe.risiken ?? 0), tone: (data?.gewerbe.risiken ?? 0) > 0 ? 'text-amber' : 'text-white' },
      ]} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl bg-navy2/60 border border-line px-4 py-3 flex items-center justify-between">
          <span className="text-[11px] text-steel uppercase tracking-wider font-semibold">Warnungen</span>
          <div className="flex items-center gap-3 text-sm font-bold">
            <Link to="/warnungen" className="text-red">{data?.warnungen.rot ?? 0} rot</Link>
            <span className="text-amber">{data?.warnungen.gelb ?? 0} gelb</span>
            <span className="text-steel2">{data?.warnungen.info ?? 0} info</span>
          </div>
        </div>
        <div className="rounded-xl bg-navy2/60 border border-line px-4 py-3 flex items-center justify-between">
          <span className="text-[11px] text-steel uppercase tracking-wider font-semibold">Datenqualität</span>
          <Link to="/datenqualitaet" className="flex items-center gap-3 text-sm font-bold">
            <span className={(data?.datenqualitaet.gesperrteVertraege ?? 0) > 0 ? 'text-amber' : 'text-white'}>{data?.datenqualitaet.gesperrteVertraege ?? 0} gesperrt</span>
            <span className="text-steel2">{data?.datenqualitaet.offeneFehler ?? 0} Fehler</span>
          </Link>
        </div>
      </div>

      {/* I-30 real-time / forecast */}
      <div className="rounded-xl bg-amber/10 border border-amber/30 px-4 py-3 mb-4 flex items-start gap-2">
        <AlertIcon size={16} />
        <div className="text-[12.5px] text-amber">
          <span className="font-semibold">Echtzeit — vorläufig.</span> Live-Staffelfortschritt und die sofortige Auswirkung von Stornos/Widerrufen. Auswirkung Stornos:{' '}
          <span className="font-bold">{eurNet(data?.echtzeit.reversalImpactGesamt ?? 0)}</span> ({data?.echtzeit.anzahlReversals ?? 0} Fälle). Nichts ist zahlbar vor SWA-Bestätigung.{' '}
          <Link to="/forecast" className="underline">Zur Live-Prognose</Link>
        </div>
      </div>

      <DataTable
        title="Echtzeit-Staffelfortschritt pro Verkäufer"
        rows={data?.echtzeit.repTierProjektionen ?? []}
        emptyText="Keine Projektion für diese Periode."
        columns={[
          { key: 'repId', header: 'Verkäufer', render: (r: any) => <Link to={`/drilldown?tab=rep&id=${r.repId}&periode=${periode}`} className="font-semibold text-brand-soft hover:underline">{r.repId.slice(0, 8)}</Link> },
          { key: 'typ', header: 'Typ', render: (r: any) => (r.isPartner ? 'Partner' : 'Angestellt') },
          { key: 'qualifiedNewCount', header: 'Neukunden', align: 'right', render: (r: any) => r.qualifiedNewCount },
          { key: 'reachedRate', header: 'Satz (retro.)', align: 'right', render: (r: any) => eurNet(r.reachedRate) },
          { key: 'next', header: 'Bis nächste Stufe', align: 'right', render: (r: any) => (r.nextThreshold == null ? <span className="text-steel">Höchste</span> : r.bisNaechsteStufe) },
          { key: 'potenzial', header: 'Potenzial', align: 'right', render: (r: any) => (r.potenzialNaechsteStufe == null ? '—' : <span className="text-green">+{eurNet(r.potenzialNaechsteStufe)}</span>) },
          { key: 'variableProvision', header: 'Projiziert', align: 'right', render: (r: any) => <span className="font-semibold tabular-nums">{eurNet(r.variableProvision)}</span> },
        ]}
      />
    </div>
  );
}

function Row({ label, val, tone, sign }: { label: string; val: string; tone: string; sign: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-steel2">{label}</span>
      <span className={tone}>{sign} {val}</span>
    </div>
  );
}
