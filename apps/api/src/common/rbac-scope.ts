import { FindOptionsWhere } from 'typeorm';
import { Rolle } from '@blitzon/shared';
import { Contract } from '../entities/contract.entity';

export interface RequestingUser {
  sub: string;
  rolle: Rolle;
  organisationId: string | null;
  repId: string | null;
}

/**
 * Shared data-visibility rule: Aussendienst sees only their own contracts, Teamleiter
 * is confined to their own organisation, Admin/Backoffice see everything. Used by both
 * ContractsService and DashboardService so the two can never drift out of sync.
 */
export function contractScopeWhere(user: RequestingUser, extra: FindOptionsWhere<Contract> = {}): FindOptionsWhere<Contract> {
  if (user.rolle === Rolle.Aussendienst) {
    return { ...extra, repId: user.repId ?? '__none__' };
  }
  if (user.rolle === Rolle.Teamleiter) {
    return { ...extra, organisationId: user.organisationId ?? '__none__' };
  }
  return extra;
}
