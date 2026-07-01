import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../common/roles.guard';
import { ROLES_KEY } from '../common/roles.decorator';
import { Rolle } from '@blitzon/shared';

function makeContext(rolle: string | null, requiredRoles: Rolle[] | undefined): ExecutionContext {
  const handler = jest.fn();
  if (requiredRoles) Reflect.defineMetadata(ROLES_KEY, requiredRoles, handler);
  return {
    getHandler: () => handler,
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: rolle ? { rolle } : null }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();
    guard = module.get(RolesGuard);
  });

  it('allows when no roles required', () => {
    expect(guard.canActivate(makeContext('aussendienst', undefined))).toBe(true);
  });

  it('allows admin_gf on admin-only route', () => {
    expect(guard.canActivate(makeContext(Rolle.AdminGf, [Rolle.AdminGf]))).toBe(true);
  });

  it('blocks teamleiter on admin-only route', () => {
    expect(() => guard.canActivate(makeContext(Rolle.Teamleiter, [Rolle.AdminGf])))
      .toThrow(ForbiddenException);
  });

  it('blocks unauthenticated on role-guarded route', () => {
    expect(() => guard.canActivate(makeContext(null, [Rolle.AdminGf])))
      .toThrow(ForbiddenException);
  });
});
