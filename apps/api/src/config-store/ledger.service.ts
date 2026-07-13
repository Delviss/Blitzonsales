import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContractStatusEvent } from '../entities/contract-status-event.entity';
import { FinancialEvent } from '../entities/financial-event.entity';

export interface StatusEventInput {
  contractId: string;
  swaOrderNumber?: string | null;
  monat?: string | null;
  status: string;
  quelle: string; // import | sync | manual
  akteur?: string | null;
}

export interface FinancialEventInput {
  contractId?: string | null;
  swaOrderNumber?: string | null;
  monat?: string | null;
  typ: string;
  betrag: number;
  quelle: string; // import | sync | manual | run
  akteur?: string | null;
  begruendung?: string | null;
}

/**
 * Append-only ledger writer/reader (I-03, Fachkonzept ch. 4.2 / 5.2 / 12.2).
 * Events are only ever inserted — never updated or deleted — so a contract's
 * full status and financial history is always reconstructable and the original
 * month / SWA order number is preserved.
 */
@Injectable()
export class LedgerService {
  constructor(
    @InjectRepository(ContractStatusEvent)
    private readonly statusRepo: Repository<ContractStatusEvent>,
    @InjectRepository(FinancialEvent)
    private readonly financialRepo: Repository<FinancialEvent>,
  ) {}

  appendStatus(input: StatusEventInput): Promise<ContractStatusEvent> {
    return this.statusRepo.save(
      this.statusRepo.create({
        contractId: input.contractId,
        swaOrderNumber: input.swaOrderNumber ?? null,
        monat: input.monat ?? null,
        status: input.status,
        quelle: input.quelle,
        akteur: input.akteur ?? null,
      }),
    );
  }

  appendFinancial(input: FinancialEventInput): Promise<FinancialEvent> {
    return this.financialRepo.save(
      this.financialRepo.create({
        contractId: input.contractId ?? null,
        swaOrderNumber: input.swaOrderNumber ?? null,
        monat: input.monat ?? null,
        typ: input.typ,
        betrag: input.betrag,
        quelle: input.quelle,
        akteur: input.akteur ?? null,
        begruendung: input.begruendung ?? null,
      }),
    );
  }

  statusHistory(contractId: string): Promise<ContractStatusEvent[]> {
    return this.statusRepo.find({ where: { contractId }, order: { createdAt: 'ASC' } });
  }

  financialHistory(contractId: string): Promise<FinancialEvent[]> {
    return this.financialRepo.find({ where: { contractId }, order: { createdAt: 'ASC' } });
  }
}
