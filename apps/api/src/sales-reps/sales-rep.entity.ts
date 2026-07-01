import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Organisation } from '../organisationen/organisation.entity';

@Entity('sales_rep')
export class SalesRep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'uuid' })
  organisation_id: string;

  @ManyToOne(() => Organisation)
  @JoinColumn({ name: 'organisation_id' })
  organisation: Organisation;

  @Column({ type: 'text', nullable: true })
  iban: string;

  @Column({ type: 'boolean', default: true })
  aktiv: boolean;
}
