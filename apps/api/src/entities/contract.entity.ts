import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { SalesRep } from './sales-rep.entity';
import { Produkt } from './produkt.entity';
import { Organisation } from './organisation.entity';
import { ImportBatch } from './import-batch.entity';

@Entity('contract')
export class Contract {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'joules_id', unique: true, nullable: false })
  joulesId: string;

  @Column({ name: 'rep_id', nullable: true })
  repId: string | null;

  @ManyToOne(() => SalesRep, { nullable: true })
  @JoinColumn({ name: 'rep_id' })
  rep: SalesRep | null;

  @Column({ name: 'produkt_id', nullable: true })
  produktId: string | null;

  @ManyToOne(() => Produkt, { nullable: true })
  @JoinColumn({ name: 'produkt_id' })
  produkt: Produkt | null;

  @Column({ name: 'organisation_id', nullable: true })
  organisationId: string | null;

  @ManyToOne(() => Organisation, { nullable: true })
  @JoinColumn({ name: 'organisation_id' })
  organisation: Organisation | null;

  @Column({ nullable: true })
  kunde: string | null;

  @Column({ nullable: true })
  plz: string | null;

  @Column({ nullable: true })
  ort: string | null;

  @Column({ name: 'str_hsnr', nullable: true })
  strHsnr: string | null;

  @Column({ nullable: true })
  verbrauch: number | null;

  @Column({ name: 'erfassungsdatum', type: 'date', nullable: true })
  erfassungsdatum: string | null;

  @Column({ name: 'lieferbeginn', type: 'date', nullable: true })
  lieferbeginn: string | null;

  @Column({ nullable: false })
  status: string;

  @Column({ name: 'import_batch_id', nullable: true })
  importBatchId: string | null;

  @ManyToOne(() => ImportBatch, { nullable: true })
  @JoinColumn({ name: 'import_batch_id' })
  importBatch: ImportBatch | null;
}
