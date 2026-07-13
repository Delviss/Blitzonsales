import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Status master data (I-06, Fachkonzept ch. 5.1 / 4.1). Seeded from the Joules
 * `OPTIONS /clients/statuses` options; the tier / compensation engines read the
 * set of qualifying statuses *only* from here.
 *
 * Valid-from versioned like the business config: changing whether a status
 * qualifies inserts a new row (same `code`, later `gueltig_ab`) rather than
 * mutating the old one, so recomputing a closed month uses the release that was
 * valid then. Safety rule: a status not explicitly released as qualifying
 * (`qualifiziert = true`) never counts.
 */
@Entity('status_master')
@Index('idx_status_master_code_gueltig_ab', ['code', 'gueltigAb'])
export class StatusMaster {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Status code / key (today the Joules status text). */
  @Column({ name: 'code', nullable: false })
  code: string;

  /** Human-readable label. */
  @Column({ name: 'bezeichnung', nullable: false })
  bezeichnung: string;

  /** Whether this status is released as qualifying for the tier engine. */
  @Column({ name: 'qualifiziert', type: 'boolean', nullable: false, default: false })
  qualifiziert: boolean;

  /** Coarse category (StatusKategorie); descriptive only. */
  @Column({ name: 'kategorie', nullable: true })
  kategorie: string | null;

  /** Valid-from date (ISO); resolution picks the latest not after the as-of date. */
  @Column({ name: 'gueltig_ab', type: 'date', nullable: false })
  gueltigAb: string;

  /** Provenance, e.g. `seed` or `joules:/clients/statuses`. */
  @Column({ name: 'quelle', nullable: true })
  quelle: string | null;

  @Column({ name: 'erstellt_von', nullable: true })
  erstelltVon: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
