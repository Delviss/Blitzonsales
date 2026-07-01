import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { AppUser } from './app-user.entity';

@Entity('import_batch')
export class ImportBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  datei: string | null;

  @Column({ nullable: true })
  zeilen: number | null;

  @Column({ name: 'importiert_von', nullable: true })
  importiertVon: string | null;

  @ManyToOne(() => AppUser, { nullable: true })
  @JoinColumn({ name: 'importiert_von' })
  importiertVonUser: AppUser | null;

  @CreateDateColumn({ name: 'zeitpunkt', type: 'timestamptz' })
  zeitpunkt: Date;

  @Column({ type: 'jsonb', nullable: true })
  fehler: Array<{ zeile: number; grund: string }> | null;
}
