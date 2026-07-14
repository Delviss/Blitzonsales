import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { IngestionArchive } from './ingestion-archive.entity';

/**
 * Data-quality error list (I-11, Fachkonzept ch. 11.1 / 12.2). A record that
 * fails a data-quality check — missing order number, unknown rep/org, missing
 * commercial term, missing/invalid surcharge, invalid status or unverifiable SWA
 * commission — is routed here instead of silently running financial automation.
 * The data-quality view (GET /api/data-quality) reads from this table.
 */
@Entity('ingestion_error')
export class IngestionError {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** api | file — where the flagged record came from. */
  @Column({ nullable: false })
  quelle: string;

  /** The archive row this record belongs to (I-10 raw copy). */
  @Column({ name: 'archive_id', nullable: true })
  archiveId: string | null;

  @ManyToOne(() => IngestionArchive, { nullable: true })
  @JoinColumn({ name: 'archive_id' })
  archive: IngestionArchive | null;

  /** SWA order number (may be null when that is exactly what is missing). */
  @Index()
  @Column({ name: 'swa_order_number', nullable: true })
  swaOrderNumber: string | null;

  /** Joules id / antragsnummer if known. */
  @Column({ name: 'joules_id', nullable: true })
  joulesId: string | null;

  /** The rep name as delivered (for the "unknown reps" data-quality panel). */
  @Column({ name: 'rep_name', nullable: true })
  repName: string | null;

  /** The organisation name as delivered (for the "unknown orgs" panel). */
  @Column({ name: 'org_name', nullable: true })
  orgName: string | null;

  /** Error category (see IngestionErrorKategorie). */
  @Column({ nullable: false })
  kategorie: string;

  /** The offending field, where applicable. */
  @Column({ nullable: true })
  feld: string | null;

  /** Human-readable reason. */
  @Column({ type: 'text', nullable: false })
  grund: string;

  /** The raw record as delivered, for inspection / re-processing. */
  @Column({ name: 'rohzeile', type: 'jsonb', nullable: true })
  rohzeile: Record<string, unknown> | null;

  /** Whether the finding has been resolved (record re-ingested cleanly). */
  @Index()
  @Column({ nullable: false, default: false })
  behoben: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
