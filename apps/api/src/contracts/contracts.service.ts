import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contract } from '../entities/contract.entity';

@Injectable()
export class ContractsService {
  constructor(@InjectRepository(Contract) private readonly repo: Repository<Contract>) {}

  findAll(repId?: string) {
    const where = repId ? { repId } : {};
    return this.repo.find({ where, relations: ['rep', 'produkt', 'organisation'], order: { joulesId: 'ASC' }, take: 200 });
  }

  findOne(id: string) {
    return this.repo.findOne({ where: { id }, relations: ['rep', 'produkt', 'organisation'] });
  }
}
