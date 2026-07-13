import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Contract } from './contract.entity';

/**
 * Append-only financial ledger (I-03, Fachkonzept ch. 4.2 / 5.2 / 12.2). Every
 * money-value change — expected/actual SWA commission, payout, reserve booking,
 * clawback, storno withholding, manual correction — is a ledger entry
 * referencing the SWA order number and the original month. Rows are never
 * mutated or deleted; corrections post as new offsetting entries.
 */
@Entity('financial_event')
export class FinancialEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contract_id', nullable: true })
  contractId: string | null;

  @ManyToOne(() => Contract, { nullable: true })
  @JoinColumn({ name: 'contract_id' })
  contract: Contract | null;

  @Column({ name: 'swa_order_number', nullable: true })
  swaOrderNumber: string | null;

  /** Original capture month (JJJJ-MM). Addenda reference this after close (I-34). */
  @Column({ name: 'monat', nullable: true })
  monat: string | null;

  /**
   * Event type, e.g. swa_expected | swa_actual | payout_employee |
   * payout_partner | overhead | reserve_commercial | storno_withholding |
   * clawback | correction.
   */
  @Column({ name: 'typ', nullable: false })
  typ: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: false })
  betrag: number;

  /** import | sync | manual | run. */
  @Column({ nullable: false })
  quelle: string;

  @Column({ name: 'akteur', nullable: true })
  akteur: string | null;

  @Column({ type: 'text', nullable: true })
  begruendung: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
