import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { SalesRep } from './sales-rep.entity';
import { Produkt } from './produkt.entity';
import { Organisation } from './organisation.entity';
import { ImportBatch } from './import-batch.entity';

@Entity('contract')
export class Contract {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'joules_id', unique: true, nullable: false })
  joulesId: string;

  @Column({ name: 'rep_id', nullable: true })
  repId: string | null;

  @ManyToOne(() => SalesRep, { nullable: true })
  @JoinColumn({ name: 'rep_id' })
  rep: SalesRep | null;

  @Column({ name: 'produkt_id', nullable: true })
  produktId: string | null;

  @ManyToOne(() => Produkt, { nullable: true })
  @JoinColumn({ name: 'produkt_id' })
  produkt: Produkt | null;

  @Column({ name: 'organisation_id', nullable: true })
  organisationId: string | null;

  @ManyToOne(() => Organisation, { nullable: true })
  @JoinColumn({ name: 'organisation_id' })
  organisation: Organisation | null;

  @Column({ nullable: true })
  kunde: string | null;

  @Column({ nullable: true })
  plz: string | null;

  @Column({ nullable: true })
  ort: string | null;

  @Column({ name: 'str_hsnr', nullable: true })
  strHsnr: string | null;

  @Column({ nullable: true })
  verbrauch: number | null;

  @Column({ name: 'erfassungsdatum', type: 'date', nullable: true })
  erfassungsdatum: string | null;

  @Column({ name: 'lieferbeginn', type: 'date', nullable: true })
  lieferbeginn: string | null;

  @Column({ nullable: false })
  status: string;

  @Column({ name: 'import_batch_id', nullable: true })
  importBatchId: string | null;

  @ManyToOne(() => ImportBatch, { nullable: true })
  @JoinColumn({ name: 'import_batch_id' })
  importBatch: ImportBatch | null;

  // --- I-02 · Fachkonzept ch. 4.2 / Joules ClientSchema extension ---

  /** SWA order number — the single traceable key for every figure (I-03/I-28). */
  @Column({ name: 'swa_order_number', nullable: true })
  swaOrderNumber: string | null;

  /** Private vs. commercial (Gewerbe). See ClientType. */
  @Column({ name: 'client_type', nullable: true })
  clientType: string | null;

  /** New vs. existing customer. See StartDeliveryType. */
  @Column({ name: 'start_delivery_type', nullable: true })
  startDeliveryType: string | null;

  /** Electricity vs. gas. See TariffEnergyType. */
  @Column({ name: 'tariff_energy_type', nullable: true })
  tariffEnergyType: string | null;

  /** Surcharge ct/kWh — electricity. */
  @Column({ name: 'rate_extra_profit_provision', type: 'numeric', precision: 10, scale: 4, nullable: true })
  rateExtraProfitProvision: number | null;

  /** Surcharge ct/kWh — gas. */
  @Column({ name: 'rate_extra_profit_provision_gp', type: 'numeric', precision: 10, scale: 4, nullable: true })
  rateExtraProfitProvisionGp: number | null;

  /** Annual / total consumption (Joules previous_volume). */
  @Column({ name: 'previous_volume', type: 'numeric', precision: 14, scale: 2, nullable: true })
  previousVolume: number | null;

  /** Pre-contract end (Vorvertrag) — drives the lead-time rule (I-31). */
  @Column({ name: 'vorvertrag_ende', type: 'date', nullable: true })
  vorvertragEnde: string | null;

  /** Contract end — stored for existing-customer outreach (I-33). */
  @Column({ name: 'vertrag_ende', type: 'date', nullable: true })
  vertragEnde: string | null;

  /** Term (Laufzeit) in months. */
  @Column({ name: 'laufzeit_monate', type: 'int', nullable: true })
  laufzeitMonate: number | null;

  /** SWA total commission for the contract. */
  @Column({ name: 'swa_gesamtprovision', type: 'numeric', precision: 12, scale: 2, nullable: true })
  swaGesamtprovision: number | null;

  /** SWA payment amount actually received. */
  @Column({ name: 'swa_zahlbetrag', type: 'numeric', precision: 12, scale: 2, nullable: true })
  swaZahlbetrag: number | null;

  @Column({ name: 'kreditcheck_datum', type: 'date', nullable: true })
  kreditcheckDatum: string | null;

  @Column({ name: 'storno_datum', type: 'date', nullable: true })
  stornoDatum: string | null;

  /** Expected SWA commission computed by our tier engine (I-14). */
  @Column({ name: 'erwartete_swa_provision', type: 'numeric', precision: 12, scale: 2, nullable: true })
  erwarteteSwaProvision: number | null;

  /** Actual SWA commission from the booking list (source of truth). */
  @Column({ name: 'tatsaechliche_swa_provision', type: 'numeric', precision: 12, scale: 2, nullable: true })
  tatsaechlicheSwaProvision: number | null;

  /** Deviation expected − actual, surfaced in the plausibility control (I-14). */
  @Column({ name: 'abweichung', type: 'numeric', precision: 12, scale: 2, nullable: true })
  abweichung: number | null;

  /** Plausibility status (ok / abweichung / offen). */
  @Column({ name: 'plausibilitaet_status', nullable: true })
  plausibilitaetStatus: string | null;

  /** Manual override value; the original SWA value stays visible (I-36). */
  @Column({ name: 'manueller_override', type: 'numeric', precision: 12, scale: 2, nullable: true })
  manuellerOverride: number | null;

  // --- I-10/I-11 · Wave 3 ingestion tracking (Fachkonzept ch. 11.1 / 12.1) ---

  /** Where this contract was last ingested from: import | sync | manual. */
  @Column({ name: 'ingest_quelle', nullable: true })
  ingestQuelle: string | null;

  /**
   * Data-quality gate (I-11): set when the record was routed to the error list
   * (missing order number, unknown rep/org, missing commercial term, invalid
   * surcharge/status, unverifiable SWA commission). A gated contract gets no
   * automatic booking — the Fachkonzept run skips it until the flag is cleared
   * by a clean re-ingestion.
   */
  @Column({ name: 'datenqualitaet_gesperrt', type: 'boolean', nullable: false, default: false })
  datenqualitaetGesperrt: boolean;
}
