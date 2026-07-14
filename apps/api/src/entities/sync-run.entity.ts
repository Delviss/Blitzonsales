import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * A single Joules/SWA sync run (I-09, Fachkonzept ch. 11.3 / 12.1). Records what
 * a delta sync did — how many records it processed, created, updated and
 * flagged — so the data-quality view can show the last sync and the operator can
 * see whether reversals/status changes came through.
 */
@Entity('sync_run')
export class SyncRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Sync type — 'joules' today; reserved for other sources later. */
  @Index()
  @Column({ nullable: false, default: 'joules' })
  typ: string;

  /** ok | teilweise | fehler | nicht_konfiguriert (see SyncRunStatus). */
  @Column({ nullable: false })
  status: string;

  /** Whether this run was manual (on-demand) or scheduled. */
  @Column({ name: 'ausloeser', nullable: true })
  ausloeser: string | null;

  /** The status filters this delta sync covered (e.g. ["In Belieferung", …]). */
  @Column({ name: 'status_filter', type: 'jsonb', nullable: true })
  statusFilter: string[] | null;

  @Column({ name: 'verarbeitet', type: 'int', nullable: false, default: 0 })
  verarbeitet: number;

  @Column({ name: 'erstellt', type: 'int', nullable: false, default: 0 })
  erstellt: number;

  @Column({ name: 'aktualisiert', type: 'int', nullable: false, default: 0 })
  aktualisiert: number;

  @Column({ name: 'fehler', type: 'int', nullable: false, default: 0 })
  fehler: number;

  /** Free-text message (e.g. the blocked-credential note, or an API error). */
  @Column({ type: 'text', nullable: true })
  meldung: string | null;

  /** app_user id, or 'system' for a scheduled run. */
  @Column({ name: 'akteur', nullable: true })
  akteur: string | null;

  @Column({ name: 'beendet_am', type: 'timestamptz', nullable: true })
  beendetAm: Date | null;

  @CreateDateColumn({ name: 'gestartet_am', type: 'timestamptz' })
  gestartetAm: Date;
}
