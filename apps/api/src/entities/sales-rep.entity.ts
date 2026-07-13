import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Organisation } from './organisation.entity';

@Entity('sales_rep')
export class SalesRep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  name: string;

  @Column({ name: 'organisation_id', nullable: true })
  organisationId: string | null;

  @ManyToOne(() => Organisation, { nullable: true })
  @JoinColumn({ name: 'organisation_id' })
  organisation: Organisation | null;

  @Column({ nullable: true })
  iban: string | null;

  @Column({ default: true })
  aktiv: boolean;

  // --- I-04 · Fachkonzept ch. 3 / 4.1 master-data extension ---

  /** sales / trainer / team_lead / site_lead. See RepRole. */
  @Column({ nullable: true })
  rolle: string | null;

  /** Base salary (Fixum basis) — gross-salary figure. */
  @Column({ name: 'grundgehalt', type: 'numeric', precision: 10, scale: 2, nullable: true })
  grundgehalt: number | null;

  @Column({ name: 'eintrittsdatum', type: 'date', nullable: true })
  eintrittsdatum: string | null;

  @Column({ name: 'austrittsdatum', type: 'date', nullable: true })
  austrittsdatum: string | null;

  /** Directly-assigned trainer (no multi-level pyramid — I-19). */
  @Column({ name: 'trainer_id', nullable: true })
  trainerId: string | null;

  @ManyToOne(() => SalesRep, { nullable: true })
  @JoinColumn({ name: 'trainer_id' })
  trainer: SalesRep | null;

  /** Directly-assigned team-lead. */
  @Column({ name: 'teamlead_id', nullable: true })
  teamleadId: string | null;

  @ManyToOne(() => SalesRep, { nullable: true })
  @JoinColumn({ name: 'teamlead_id' })
  teamlead: SalesRep | null;

  /** Negative commission balance from salary protection (I-18). */
  @Column({ name: 'negativsaldo', type: 'numeric', precision: 12, scale: 2, default: 0 })
  negativsaldo: number;

  /** Storno account balance from the 10% withholding (I-18/I-23). */
  @Column({ name: 'storno_konto_saldo', type: 'numeric', precision: 12, scale: 2, default: 0 })
  stornoKontoSaldo: number;
}
