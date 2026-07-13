import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Contract } from './contract.entity';

/**
 * Append-only status history for a contract (I-03, Fachkonzept ch. 4.2 / 5.2).
 * The contract stays one stable entity; every status change is a timestamped
 * event referencing the SWA order number and the capture month. Rows are never
 * mutated or deleted.
 */
@Entity('contract_status_event')
export class ContractStatusEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contract_id', nullable: false })
  contractId: string;

  @ManyToOne(() => Contract, { nullable: false })
  @JoinColumn({ name: 'contract_id' })
  contract: Contract;

  /** The SWA order number as of this event (traceability). */
  @Column({ name: 'swa_order_number', nullable: true })
  swaOrderNumber: string | null;

  /** Original capture month (JJJJ-MM) this event belongs to. */
  @Column({ name: 'monat', nullable: true })
  monat: string | null;

  @Column({ nullable: false })
  status: string;

  /** import | sync | manual — where the change came from. */
  @Column({ nullable: false })
  quelle: string;

  /** app_user id or 'system'. */
  @Column({ name: 'akteur', nullable: true })
  akteur: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
