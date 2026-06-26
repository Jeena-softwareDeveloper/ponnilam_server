import { Prisma } from '@prisma/client';
import prisma from './prisma';

type Db = Prisma.TransactionClient | typeof prisma;

export async function countCenterMembers(
  db: Db,
  centerId: string,
  excludeCustomerId?: string
): Promise<number> {
  return db.customer.count({
    where: {
      centerId,
      centerMemberType: { not: 'IMPORT' },
      ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}),
    },
  });
}

export async function validateCenterMemberLimit(
  db: Db,
  centerId: string,
  options: { excludeCustomerId?: string; memberType?: string } = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  const memberType = options.memberType ?? 'MEMBER';
  if (memberType === 'IMPORT') return { ok: true };

  const center = await db.center.findUnique({ where: { id: centerId } });
  if (!center) return { ok: false, error: 'Invalid center selected' };

  const limit = center.totalMembers;
  if (!limit || limit <= 0) return { ok: true };

  const current = await countCenterMembers(db, centerId, options.excludeCustomerId);
  if (current >= limit) {
    return {
      ok: false,
      error: `Center "${center.name}" already has ${current} member(s). Maximum allowed is ${limit}. Use "Import for Second Loan" for additional loan customers.`,
    };
  }

  return { ok: true };
}

export async function validateCustomerCenterAssignment(
  db: Db,
  centerId: string,
  areaId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const center = await db.center.findUnique({ where: { id: centerId } });
  if (!center) return { ok: false, error: 'Invalid center selected' };
  if (center.areaId !== areaId) {
    return { ok: false, error: 'Customer can only belong to a center in their own area. Cross-branch or cross-area mapping is not allowed.' };
  }
  return { ok: true };
}

export async function countGroupMembers(
  db: Db,
  groupId: string,
  excludeCustomerId?: string
): Promise<number> {
  return db.customer.count({
    where: {
      groupId,
      centerMemberType: { not: 'IMPORT' },
      ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}),
    },
  });
}

export async function validateGroupMemberLimit(
  db: Db,
  groupId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const group = await db.group.findUnique({
    where: { id: groupId },
    include: { center: true },
  });
  if (!group) return { ok: false, error: 'Invalid group selected' };

  const limit = group.center?.totalMembers;
  if (!limit || limit <= 0) return { ok: true };

  const current = await countGroupMembers(db, groupId);
  if (current >= limit) {
    return {
      ok: false,
      error: `Group "${group.groupName}" is full (${limit} members max).`,
    };
  }

  return { ok: true };
}
