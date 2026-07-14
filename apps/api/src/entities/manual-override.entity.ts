import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Contract } from './contract.entity';

/**
 * Manual override audit trail (I-36, Fachkonzept ch. 12.2 / 12.1).
 *
 * A manual correction must be fully auditable and must never hide the original
 * SWA value. Each override captures the actor, timestamp, old value, new value,
 * a mandatory reason and an optional document reference. It is an append-only
 * record — the original values stay on the contract (`swa_gesamtprovision` /
 * `tatsaechliche_swa_provision`); only `manueller_override` carries the
 * corrected booking value, so both the original and the override are always
 * visible.
 */
@Entity('manual_override')
export class ManualOverride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Overridden entity, e.g. 'contract'. */
  @Column({ nullable: false })
  entity: string;

  @Column({ name: 'entity_id', nullable: false })
  entityId: string;

  @Column({ name: 'contract_id', nullable: true })
  contractId: string | null;

  @ManyToOne(() => Contract, { nullable: true })
  @JoinColumn({ name: 'contract_id' })
  contract: Contract | null;

  /** Which value was overridden, e.g. 'swa_provision'. */
  @Column({ nullable: false })
  feld: string;

  /** The value before the override (the original stays visible on the contract). */
  @Column({ name: 'alt_wert', type: 'numeric', precision: 12, scale: 2, nullable: true })
  altWert: number | null;

  @Column({ name: 'neu_wert', type: 'numeric', precision: 12, scale: 2, nullable: true })
  neuWert: number | null;

  /** The original, never-hidden SWA value captured at override time (ch. 12.2). */
  @Column({ name: 'original_swa', type: 'numeric', precision: 12, scale: 2, nullable: true })
  originalSwa: number | null;

  @Column({ type: 'text', nullable: false })
  grund: string;

  /** Optional supporting document reference (URL / file name / note). */
  @Column({ name: 'dokument', type: 'text', nullable: true })
  dokument: string | null;

  @Column({ name: 'akteur', nullable: true })
  akteur: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
