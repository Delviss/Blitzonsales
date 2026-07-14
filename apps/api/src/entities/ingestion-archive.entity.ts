import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Immutable ingestion archive (I-10, Fachkonzept ch. 12.2). Every API fetch and
 * every file import is archived here with its metadata and a byte-for-byte raw
 * copy of the payload, so any past ingestion is fully auditable. Rows are only
 * ever inserted — never updated or deleted.
 */
@Entity('ingestion_archive')
export class IngestionArchive {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** api | file — the ingestion channel (see IngestionSource). */
  @Index()
  @Column({ nullable: false })
  quelle: string;

  /** Endpoint path (API) or original filename (file). */
  @Column({ nullable: true })
  referenz: string | null;

  /** app_user id, or 'system' for a scheduled/automated fetch. */
  @Column({ name: 'akteur', nullable: true })
  akteur: string | null;

  /** Number of records the payload yielded. */
  @Column({ name: 'satz_anzahl', type: 'int', nullable: false, default: 0 })
  satzAnzahl: number;

  /** Number of records routed to the error list from this payload. */
  @Column({ name: 'fehler_anzahl', type: 'int', nullable: false, default: 0 })
  fehlerAnzahl: number;

  /** MIME/content type of the raw payload (e.g. application/json, text/csv). */
  @Column({ name: 'content_type', nullable: true })
  contentType: string | null;

  /** SHA-256 of the raw payload — lets an auditor prove the copy is untampered. */
  @Column({ name: 'sha256', nullable: true })
  sha256: string | null;

  /** The immutable raw payload, stored verbatim. */
  @Column({ name: 'rohdaten', type: 'text', nullable: true })
  rohdaten: string | null;

  /** Optional structured metadata (status filter, sync run id, batch id, …). */
  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'zeitpunkt', type: 'timestamptz' })
  zeitpunkt: Date;
}
