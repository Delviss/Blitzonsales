import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * A single versioned business-config value (I-01, Fachkonzept ch. 16). Every
 * business value is stored here with a `gueltig_ab` date; changing a value
 * inserts a new row rather than mutating the old one, so recomputing a closed
 * month always uses the version that was valid then. Never hardcode these in
 * the engines — resolve them as-of a reference date via ConfigService.
 */
@Entity('config_version')
export class ConfigVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** One of the ConfigKey values from @blitzon/shared. */
  @Column({ name: 'schluessel', nullable: false })
  schluessel: string;

  /** The value, stored as JSON to hold scalars, arrays and tier tables. */
  @Column({ name: 'wert', type: 'jsonb', nullable: false })
  wert: unknown;

  @Column({ name: 'gueltig_ab', type: 'date', nullable: false })
  gueltigAb: string;

  @Column({ name: 'erstellt_von', nullable: true })
  erstelltVon: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
