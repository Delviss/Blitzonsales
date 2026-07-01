import { useEffect, useRef, useState } from 'react';
import { apiFetch, apiUpload } from '../lib/auth';
import DataTable from '../components/DataTable';

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

export default function ImportPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = () => apiFetch('/api/import/batches').then(r => r.json()).then(setBatches).catch(() => {});
  useEffect(() => { load(); }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    setUploading(true); setError(null); setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiUpload('/api/import', formData);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? 'Import fehlgeschlagen.');
      setResult(body);
      if (fileInput.current) fileInput.current.value = '';
      load();
    } catch (e: any) {
      setError(e.message ?? 'Import fehlgeschlagen.');
    }
    setUploading(false);
  };

  return (
    <div>
      <div className="text-[12px] tracking-[2.5px] text-lime font-bold uppercase mb-1">Provisionierung</div>
      <h1 className="text-2xl font-extrabold mb-6">Vertragsimport (Joules)</h1>

      <form onSubmit={handleUpload} className="mb-8 bg-panel border border-line rounded-xl p-5 flex gap-3 items-end flex-wrap">
        <div>
          <label className="block text-[11px] font-semibold text-steel uppercase tracking-wide mb-1">Joules-Export (CSV/Excel)</label>
          <input ref={fileInput} type="file" accept=".csv,.xlsx,.xls" required
            className="text-sm text-steel2 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-navy2 file:text-white file:text-sm" />
        </div>
        <button type="submit" disabled={uploading}
          className="bg-lime text-navy font-bold px-4 py-2 rounded-lg hover:bg-lime2 transition-colors disabled:opacity-50">
          {uploading ? 'Importiere…' : 'Hochladen'}
        </button>
        {error && <span className="text-red text-sm">{error}</span>}
      </form>

      {result && (
        <div className="mb-8 bg-panel border border-line rounded-xl p-5">
          <h2 className="font-bold text-white mb-3">Ergebnis</h2>
          <div className="flex gap-6 flex-wrap text-sm mb-3">
            <span className="text-steel2">Zeilen: <span className="text-white font-bold">{result.zeilen}</span></span>
            <span className="text-steel2">Neu angelegt: <span className="text-green font-bold">{result.erstellt}</span></span>
            <span className="text-steel2">Aktualisiert: <span className="text-lime2 font-bold">{result.aktualisiert}</span></span>
            <span className="text-steel2">Hinweise: <span className={result.fehler.length ? 'text-amber font-bold' : 'text-white font-bold'}>{result.fehler.length}</span></span>
          </div>
          {result.fehler.length > 0 && (
            <ul className="text-[12.5px] text-amber list-disc list-inside space-y-1">
              {result.fehler.map((f, i) => <li key={i}>{f.zeile ? `Zeile ${f.zeile}: ` : ''}{f.grund}</li>)}
            </ul>
          )}
        </div>
      )}

      <h2 className="text-lg font-bold mb-3">Letzte Imports</h2>
      <DataTable<Batch>
        rows={batches}
        columns={[
          { key: 'datei', header: 'Datei', render: r => <span className="font-semibold text-white">{r.datei ?? '—'}</span> },
          { key: 'zeilen', header: 'Zeilen' },
          { key: 'importiertVonUser', header: 'Importiert von', render: r => r.importiertVonUser?.email ?? '—' },
          { key: 'zeitpunkt', header: 'Zeitpunkt', render: r => new Date(r.zeitpunkt).toLocaleString('de-DE') },
          { key: 'fehler', header: 'Hinweise', render: r => r.fehler?.length ? <span className="text-amber font-bold">{r.fehler.length}</span> : <span className="text-steel">0</span> },
        ]}
      />
    </div>
  );
}
