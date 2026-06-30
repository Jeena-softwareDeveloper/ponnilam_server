import prisma from '../../utils/prisma';
import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireBranchAccess } from '../../utils/security.utils';
import { processLoanCollection, voidCollection } from '../../utils/collection.utils';
import { LOAN_COLLECTIBLE_STATUSES } from '../../utils/prisma-enums';
import { getDayRange, getDateRangeBounds } from '../../utils/date.utils';
import { isAdminUser } from '../../utils/user.utils';
import { assertMenuPermission, checkAreaScope, resolveStaffId } from '../../utils/validation.helpers';
import { parsePagination, paginatedResponse } from '../../utils/pagination.utils';

export const createCollection = asyncHandler(async (req: Request, res: Response) => {
  const { loanId, staffId, amount, trnDate, remarks } = req.body;

  if (!loanId || amount === undefined || amount === null) {
    return res.status(400).json({ error: 'Loan ID and Amount are required' });
  }
  if (Number(amount) <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than zero' });
  }
  if (!trnDate || isNaN(new Date(trnDate).getTime())) {
    return res.status(400).json({ error: 'Valid transaction date is required' });
  }

  const user = (req as any).user;
  const createPerm = await assertMenuPermission(user, '/admin/collections', 'canCreate');
  if (createPerm) return res.status(403).json({ error: createPerm });

  const loanPreview = await prisma.loan.findUnique({
    where: { id: loanId },
    include: { customer: { include: { area: true } } },
  });
  if (!loanPreview) return res.status(404).json({ error: 'Loan not found' });
  requireBranchAccess(user, loanPreview.customer?.area?.branchId, 'create a collection for a loan outside your branch');
  const areaScopeErr = checkAreaScope(user, res.locals.areaIds, loanPreview.customer?.areaId);
  if (areaScopeErr) return res.status(403).json({ error: areaScopeErr });

  const staffResult = await resolveStaffId(staffId, user);
  if ('error' in staffResult) return res.status(400).json({ error: staffResult.error });
  const resolvedStaffId = staffResult.staffId;

  if (!LOAN_COLLECTIBLE_STATUSES.includes(loanPreview.status as (typeof LOAN_COLLECTIBLE_STATUSES)[number])) {
    return res.status(400).json({ error: `Cannot collect on loan with status ${loanPreview.status}` });
  }

  const processed = await prisma.$transaction(async (tx) =>
    processLoanCollection(tx, {
      loanId,
      amount: Number(amount),
      trnDate: new Date(trnDate),
      staffId: resolvedStaffId,
      remarks,
      userBranchId: user?.branchId,
      isAdmin: isAdminUser(user),
    })
  );

  if (processed.skipped) {
    const msg = processed.skipReason || 'Collection skipped';
    const status = msg.includes('Duplicate') ? 409 : 400;
    return res.status(status).json({ error: msg });
  }

  const result = await prisma.collection.findUnique({
    where: { id: processed.collection.id },
    include: { loan: true, staff: true },
  });

  res.status(201).json(result);
});

export const getCollections = asyncHandler(async (req: Request, res: Response) => {
  const { loanId, staffId, branchId, centerId, trnDate, areaId, fromDate, toDate, includeVoided } = req.query;
  const where: any = {};
  if (includeVoided !== 'true') where.isVoided = false;
  if (loanId) where.loanId = String(loanId);
  if (staffId) where.staffId = String(staffId);

  const user = (req as any).user;
  const userBranchId = user?.branchId;

  if (res.locals.areaIds && res.locals.areaIds.length > 0) {
    where.loan = { customer: { areaId: { in: res.locals.areaIds } } };
  } else if (userBranchId) {
    where.loan = { customer: { area: { branchId: userBranchId } } };
  } else if (branchId && branchId !== 'all') {
    where.loan = { customer: { area: { branchId: String(branchId) } } };
  }

  if (centerId) {
    if (!where.loan) where.loan = { customer: {} };
    where.loan.customer = { ...where.loan.customer, centerId: String(centerId) };
  }

  if (areaId) {
    if (!where.loan) where.loan = { customer: {} };
    where.loan.customer = { ...where.loan.customer, areaId: String(areaId) };
  }

  if (trnDate) {
    const { dayStart, dayEnd } = getDayRange(new Date(String(trnDate)));
    where.trnDate = { gte: dayStart, lte: dayEnd };
  } else if (fromDate || toDate) {
    where.trnDate = getDateRangeBounds(
      fromDate ? String(fromDate) : undefined,
      toDate ? String(toDate) : undefined
    );
  }

  const { page, limit, skip } = parsePagination(req.query as Record<string, string>);

  const [collections, total] = await Promise.all([
    prisma.collection.findMany({
      where,
      include: {
        loan: {
          include: {
            customer: { include: { area: { include: { branch: true } } } },
            schedules: { orderBy: { dueDate: 'asc' } },
          },
        },
        staff: true,
      },
      orderBy: { trnDate: 'desc' },
      skip,
      take: limit,
    }),
    prisma.collection.count({ where }),
  ]);

  res.json(paginatedResponse(collections, total, page, limit));
});

export const voidCollectionEntry = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;
  if (!reason?.trim()) return res.status(400).json({ error: 'Void reason is required' });

  const user = (req as any).user;
  const deletePerm = await assertMenuPermission(user, '/admin/collections', 'canDelete');
  if (deletePerm) return res.status(403).json({ error: deletePerm });

  const existing = await prisma.collection.findUnique({
    where: { id: String(id) },
    include: { loan: { include: { customer: { include: { area: true } } } } },
  });
  if (!existing) return res.status(404).json({ error: 'Collection not found' });
  if (existing.isVoided) return res.status(400).json({ error: 'Collection is already voided' });

  requireBranchAccess(user, existing.loan?.customer?.area?.branchId, 'void a collection outside your branch');
  const areaScopeErr = checkAreaScope(user, res.locals.areaIds, existing.loan?.customer?.areaId);
  if (areaScopeErr) return res.status(403).json({ error: areaScopeErr });

  await prisma.$transaction(async (tx) => {
    await voidCollection(tx, String(id), reason.trim(), user.id);
  });

  const updated = await prisma.collection.findUnique({
    where: { id: String(id) },
    include: { loan: true, staff: true },
  });
  res.json(updated);
});
