import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { SalesRep } from '../sales-reps/sales-rep.entity';
import { Produkt } from '../produkte/produkt.entity';
import { Organisation } from '../organisationen/organisation.entity';
import { AppUser } from '../app-users/app-user.entity';

@Entity('import_batch')
export class ImportBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  datei: string;

  @Column({ type: 'integer' })
  zeilen: number;

  @Column({ type: 'uuid' })
  importiert_von: string;

  @ManyToOne(() => AppUser)
  @JoinColumn({ name: 'importiert_von' })
  user: AppUser;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  zeitpunkt: Date;
}

@Entity('contract')
export class Contract {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  joules_id: string;

  @Column({ type: 'uuid' })
  rep_id: string;

  @ManyToOne(() => SalesRep)
  @JoinColumn({ name: 'rep_id' })
  rep: SalesRep;

  @Column({ type: 'uuid' })
  produkt_id: string;

  @ManyToOne(() => Produkt)
  @JoinColumn({ name: 'produkt_id' })
  produkt: Produkt;

  @Column({ type: 'uuid' })
  organisation_id: string;

  @ManyToOne(() => Organisation)
  @JoinColumn({ name: 'organisation_id' })
  organisation: Organisation;

  @Column({ type: 'text', nullable: true })
  kunde: string | null;

  @Column({ type: 'text', nullable: true })
  plz: string | null;

  @Column({ type: 'text', nullable: true })
  ort: string | null;

  @Column({ type: 'text', nullable: true })
  str_hsnr: string | null;

  @Column({ type: 'integer', nullable: true })
  verbrauch: number | null;

  @Column({ type: 'date', nullable: true })
  erfassungsdatum: string | null;

  @Column({ type: 'date', nullable: true })
  lieferbeginn: string | null;

  @Column({ type: 'text' })
  status: string;

  @Column({ type: 'uuid', nullable: true })
  import_batch_id: string | null;

  @ManyToOne(() => ImportBatch, { nullable: true })
  @JoinColumn({ name: 'import_batch_id' })
  import_batch: ImportBatch | null;
}
