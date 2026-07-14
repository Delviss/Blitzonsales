import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Contract } from './contract.entity';

/**
 * A follow-up (Wiedervorlage) scheduled when a contract intake is rejected for
 * "Vorlaufzeit zu lang" (I-31/I-32, Fachkonzept ch. 5.3 / 13). It stores the
 * first admissible intake day (`faellig_am`); on that day the tool notifies
 * Founder/Backoffice by email so the contract can be re-taken within the lead
 * time. The record is the auditable lead; the email is dispatched from it.
 */
@Entity('wiedervorlage')
export class Wiedervorlage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Linked contract, if the follow-up originates from a stored contract. */
  @Column({ name: 'contract_id', nullable: true })
  contractId: string | null;

  @ManyToOne(() => Contract, { nullable: true })
  @JoinColumn({ name: 'contract_id' })
  contract: Contract | null;

  /** SWA order number for traceability (may be present without a stored contract). */
  @Column({ name: 'swa_order_number', nullable: true })
  swaOrderNumber: string | null;

  /** Customer label for the follow-up list. */
  @Column({ nullable: true })
  kunde: string | null;

  /** Pre-contract end that drove the lead-time breach. */
  @Column({ name: 'vorvertrag_ende', type: 'date', nullable: true })
  vorvertragEnde: string | null;

  /** Requested delivery start evaluated against (day after the pre-contract). */
  @Column({ name: 'liefer_start', type: 'date', nullable: true })
  lieferStart: string | null;

  /** The intake day on which the contract was (too early) rejected. */
  @Column({ name: 'abgelehnt_am', type: 'date', nullable: true })
  abgelehntAm: string | null;

  /** First admissible intake day — the day the follow-up/email becomes due. */
  @Column({ name: 'faellig_am', type: 'date', nullable: false })
  faelligAm: string;

  /** Rejection reason (always "Vorlaufzeit zu lang" for the lead-time rule). */
  @Column({ nullable: false })
  grund: string;

  /** offen | benachrichtigt | erledigt. */
  @Column({ nullable: false, default: 'offen' })
  status: string;

  /** When the notification email was dispatched (null until due & processed). */
  @Column({ name: 'email_gesendet_am', type: 'timestamptz', nullable: true })
  emailGesendetAm: Date | null;

  @Column({ name: 'erstellt_von', nullable: true })
  erstelltVon: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
