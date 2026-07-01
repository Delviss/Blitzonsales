import { CommissionRun } from '../../entities/commission-run.entity';
import { CommissionLine } from '../../entities/commission-line.entity';

function formatEur(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

/** Renders a per-rep Abrechnungsblatt PDF for a frozen commission run. */
export function buildAbrechnungPdf(run: CommissionRun, repName: string, lines: CommissionLine[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // @types/pdfkit's `export =` types the module as an instance, not a constructor,
    // so a normal `import` does not type-check `new PDFDocument(...)`.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text('BlitzON Control: Abrechnungsblatt', { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#555').text(`Verkäufer: ${repName}`);
    doc.text(`Periode: ${run.periode}`);
    doc.text(`Status: ${run.status === 'freigegeben' ? 'Freigegeben' : 'Entwurf'}`);
    if (run.freigegebenAm) doc.text(`Freigegeben am: ${new Date(run.freigegebenAm).toLocaleDateString('de-DE')}`);
    doc.moveDown(1);

    const colX = { vertrag: 50, kunde: 150, typ: 300, betrag: 370, grund: 440 };
    doc.fontSize(9).fillColor('#000');
    doc.text('Vertrag', colX.vertrag, doc.y, { continued: false });
    doc.text('Kunde', colX.kunde, doc.y - doc.currentLineHeight());
    doc.text('Typ', colX.typ, doc.y - doc.currentLineHeight());
    doc.text('Betrag', colX.betrag, doc.y - doc.currentLineHeight());
    doc.text('Begründung', colX.grund, doc.y - doc.currentLineHeight());
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown(0.3);

    let total = 0;
    for (const line of lines) {
      total += Number(line.betrag);
      const y = doc.y;
      doc.fontSize(8.5).fillColor('#000');
      doc.text(line.contract?.joulesId ?? '—', colX.vertrag, y, { width: 95 });
      doc.text(line.contract?.kunde ?? '—', colX.kunde, y, { width: 145 });
      doc.text(line.typ === 'clawback' ? 'Rückbuchung' : 'Normal', colX.typ, y, { width: 65 });
      doc.fillColor(Number(line.betrag) < 0 ? '#b33' : '#2a7a3d').text(formatEur(Number(line.betrag)), colX.betrag, y, { width: 65 });
      doc.fillColor('#555').text(line.begruendung ?? '—', colX.grund, y, { width: 105 });
      doc.moveDown(0.6);
      if (doc.y > 760) doc.addPage();
    }

    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#000').text(`Gesamtsumme: ${formatEur(total)}`, { align: 'right' });

    doc.end();
  });
}
