import { useEffect, useRef, useState, DragEvent } from 'react';
import { apiFetch, apiUpload } from '../lib/auth';
import DataTable from '../components/DataTable';
import PageHeader from '../components/PageHeader';
import { UploadIcon, FileTextIcon, CheckIcon, AlertIcon } from '../components/icons';

interface Batch {
  id: string;
  datei: string | null;
  zeilen: number | null;
  zeitpunkt: string;
  fehler: { zeile: number; grund: string }[] | null;
  importiertVonUser?: { email: string } | null;
}
interface ImportResult {
  batchId: string;
  zeilen: number;
  erstellt: number;
  aktualisiert: number;
  fehler: { zeile: number; grund: string }[];
}

const ACCEPTED = ['.csv', '.xlsx', '.xls'];

export default function ImportPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = () => apiFetch('/api/import/batches').then(r => r.json()).then(setBatches).catch(() => {});
  useEffect(() => { load(); }, []);

  const acceptFile = (f: File | undefined) => {
    if (!f) return;
    const ok = ACCEPTED.some(ext => f.name.toLowerCase().endsWith(ext));
    if (!ok) {
      setError('Nur CSV- oder Excel-Dateien (.csv, .xlsx, .xls) werden unterstützt.');
      return;
    }
    setError(null);
    setFile(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    acceptFile(e.dataTransfer.files?.[0]);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true); setError(null); setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiUpload('/api/import', formData);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? 'Import fehlgeschlagen.');
      setResult(body);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      load();
    } catch (e: any) {
      setError(e.message ?? 'Import fehlgeschlagen.');
    }
    setUploading(false);
  };

  return (
    <div>
      <PageHeader
        kicker="Provisionierung"
        title="Vertragsimport (Joules)"
        subtitle="Lade den Joules-Export hoch – neue Verträge werden angelegt, bestehende aktualisiert."
      />

      <div className="card p-6 mb-6 animate-fade-up">
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInput.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click(); }}
          className={`relative rounded-2xl border-2 border-dashed px-6 py-10 text-center cursor-pointer
            transition-all duration-300 outline-none focus-visible:ring-4 focus-visible:ring-brand/15
            ${dragging
              ? 'border-brand bg-brand/[0.07] scale-[1.005]'
              : 'border-line hover:border-brand/50 hover:bg-brand/[0.03]'}`}
        >
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED.join(',')}
            className="hidden"
            onChange={e => acceptFile(e.target.files?.[0])}
          />
          <div className={`mx-auto mb-4 h-14 w-14 rounded-2xl border flex items-center justify-center transition-all duration-300
            ${dragging ? 'border-brand/50 bg-brand/15 text-brand scale-110' : 'border-line bg-navy2 text-steel2'}`}>
            <UploadIcon size={22} />
          </div>
          {file ? (
            <>
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-navy2 border border-line rounded-xl px-3.5 py-2">
                <FileTextIcon size={14} className="text-brand" />
                {file.name}
                <span className="text-steel text-[11px] font-normal">({(file.size / 1024).toFixed(0)} KB)</span>
              </div>
              <p className="text-steel text-[12px] mt-3">Klicken, um eine andere Datei zu wählen.</p>
            </>
          ) : (
            <>
              <p className="text-ink font-semibold text-sm">
                Datei hierher ziehen <span className="text-steel2 font-normal">oder klicken zum Auswählen</span>
              </p>
              <p className="text-steel text-[12px] mt-1.5">Joules-Export als CSV oder Excel (.csv, .xlsx, .xls)</p>
            </>
          )}
        </div>

        <div className="flex items-center gap-4 mt-5">
          <button onClick={handleUpload} disabled={!file || uploading} className="btn-primary">
            <UploadIcon size={15} />
            {uploading ? 'Importiere…' : 'Import starten'}
          </button>
          {error && <span className="text-red text-sm animate-fade-in">{error}</span>}
        </div>
      </div>

      {result && (
        <div className="card p-6 mb-6 border-brand/30 animate-fade-up">
          <div className="flex items-center gap-2 mb-4">
            <span className="h-7 w-7 rounded-lg bg-green/10 border border-green/25 text-green flex items-center justify-center">
              <CheckIcon size={14} />
            </span>
            <h2 className="font-bold text-white">Import abgeschlossen</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Zeilen', val: result.zeilen, cls: 'text-white' },
              { label: 'Neu angelegt', val: result.erstellt, cls: 'text-green' },
              { label: 'Aktualisiert', val: result.aktualisiert, cls: 'text-brand-soft' },
              { label: 'Hinweise', val: result.fehler.length, cls: result.fehler.length ? 'text-amber' : 'text-white' },
            ].map(s => (
              <div key={s.label} className="rounded-xl bg-navy2/60 border border-line px-4 py-3">
                <div className="text-[10.5px] text-steel uppercase tracking-wider font-semibold">{s.label}</div>
                <div className={`text-xl font-extrabold tabular-nums mt-0.5 ${s.cls}`}>{s.val}</div>
              </div>
            ))}
          </div>
          {result.fehler.length > 0 && (
            <ul className="space-y-1.5">
              {result.fehler.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-[12.5px] text-amber">
                  <AlertIcon size={13} className="mt-0.5 shrink-0" />
                  <span>{f.zeile ? `Zeile ${f.zeile}: ` : ''}{f.grund}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <DataTable<Batch>
        title="Letzte Imports"
        rows={batches}
        columns={[
          { key: 'datei', header: 'Datei', render: r => <span className="font-semibold text-ink">{r.datei ?? '—'}</span> },
          { key: 'zeilen', header: 'Zeilen' },
          { key: 'importiertVonUser', header: 'Importiert von', render: r => r.importiertVonUser?.email ?? '—' },
          { key: 'zeitpunkt', header: 'Zeitpunkt', render: r => new Date(r.zeitpunkt).toLocaleString('de-DE') },
          {
            key: 'fehler', header: 'Hinweise',
            render: r => r.fehler?.length
              ? <span className="chip bg-amber/10 text-amber border-amber/30">{r.fehler.length}</span>
              : <span className="text-steel">0</span>,
          },
        ]}
      />
    </div>
  );
}
