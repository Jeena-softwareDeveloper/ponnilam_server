import { Request, Response } from 'express';
import prisma from '../../utils/prisma';
import { LOAN_COLLECTIBLE_STATUSES, LoanStatus, OPEN_LOAN_STATUSES } from '../../utils/prisma-enums';
import { countCenterMembers } from '../../utils/center-member.utils';
import { loanDemandForCollectionDate, handleManualLoanClose } from '../../utils/loan.utils';
import { toCollectionDay } from '../../utils/date.utils';

function sortCustomersByRegistration<
  T extends { createdAt?: Date | string | null; customerNo?: string | null },
>(customers: T[]): T[] {
  return [...customers].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (aTime !== bTime) return aTime - bTime;
    return (a.customerNo || '').localeCompare(b.customerNo || '', undefined, { numeric: true });
  });
}
import { denyUnlessMenuPermission } from '../../utils/master-permissions';
import { generateCenterCodeInTx } from '../../utils/center-code.utils';
import { allocateCenterShortCode } from '../../utils/center-short-code.service';

const MENU_PATH = '/admin/masters/centers';
import { parsePagination, paginatedResponse } from '../../utils/pagination.utils';

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const getCenters = async (req: Request, res: Response): Promise<any> => {
  try {
    const { branchId, staffId, paginate, scope, onlyActive } = req.query;
    const user = (req as any).user;
    const userBranchId = user?.branchId;
    
    const whereClause: any = {};
    
    // If scope is explicitly 'all' or branchId is 'all', do not restrict by userBranchId
    if (scope === 'all' || branchId === 'all') {
      // Allow viewing all centers
    } else if (branchId && branchId !== 'all') {
      whereClause.area = { branchId: String(branchId) };
    } else if (userBranchId && user?.role?.name !== 'Admin') {
      whereClause.area = { branchId: userBranchId };
    }

    if (staffId) {
      whereClause.employeeId = String(staffId);
    } else if (user?.role?.name === 'Collection Staff' && user?.id) {
      whereClause.employeeId = user.id;
    }
    
    let centers;
    let total = 0;
    let page = 1, limit = 20;

    const queryArgs = {
      where: whereClause,
      include: { 
        employee: { include: { role: true } }, 
        area: { include: { branch: true } },
        groups: { select: { id: true, groupName: true, groupCode: true, meetingDay: true } },
        customers: {
          include: {
            loans: {
              select: { status: true, firstDueDate: true, sanctionDate: true, createdAt: true, outstandingAmount: true, perDueAmount: true }
            }
          }
        }
      },
      orderBy: [
        { createdAt: 'desc' },
        { code: 'asc' }
      ] as any,
    };

    if (paginate === 'true') {
      const parsed = parsePagination(req.query as Record<string, string>);
      page = parsed.page;
      limit = parsed.limit;
      const skip = parsed.skip;
      
      const [fetchedCenters, totalCount] = await prisma.$transaction([
        prisma.center.findMany({ ...queryArgs, skip, take: limit }),
        prisma.center.count({ where: whereClause })
      ]);
      centers = fetchedCenters;
      total = totalCount;
    } else {
      centers = await prisma.center.findMany(queryArgs);
    }

    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

    // Query pending staff entries for these centers
    const centerIds = centers.map((c) => c.id);
    const pendingStaffEntries = await prisma.staffEntry.findMany({
      where: {
        centerId: { in: centerIds },
        status: 'PENDING',
      },
      select: {
        centerId: true,
        amount: true,
      },
    });
    const pendingMap = new Map<string, { count: number; amount: number }>();
    for (const pe of pendingStaffEntries) {
      const cur = pendingMap.get(pe.centerId) || { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += pe.amount;
      pendingMap.set(pe.centerId, cur);
    }

    // Query non-voided collections created today for these centers
    const todayStr = toCollectionDay(new Date());
    const todayCollections = await prisma.collection.findMany({
      where: {
        loan: { centerId: { in: centerIds } },
        collectionDay: todayStr,
        isVoided: false,
      },
      select: {
        amount: true,
        loan: { select: { centerId: true } },
      },
    });

    const confirmedMap = new Map<string, { count: number; amount: number }>();
    for (const tc of todayCollections) {
      const cId = tc.loan?.centerId;
      if (!cId) continue;
      const cur = confirmedMap.get(cId) || { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += tc.amount;
      confirmedMap.set(cId, cur);
    }

    const enrichedCenters = centers.map(center => {
      let activeLoansCount = 0;
      let pendingSetupCount = 0;
      let totalOutstandingAmount = 0;
      let totalDemand = 0;
      let earliestEmiDate: any = null;

      center.customers.forEach(customer => {
        const openLoans = customer.loans.filter(l => LOAN_COLLECTIBLE_STATUSES.includes(l.status as typeof LOAN_COLLECTIBLE_STATUSES[number]));
        if (openLoans.length > 0) {
          activeLoansCount++;
          openLoans.forEach(l => {
            totalOutstandingAmount += (l.outstandingAmount || 0);
            totalDemand += (l.perDueAmount || 0);
            const d = l.firstDueDate ? new Date(l.firstDueDate) : l.sanctionDate ? new Date(l.sanctionDate) : new Date(l.createdAt);
            if (!earliestEmiDate || d < earliestEmiDate) {
              earliestEmiDate = d;
            }
          });
        } else if (!customer.loans.some(l => l.status === LoanStatus.PENDING)) {
          pendingSetupCount++;
        }
      });

      const firstEmiDateStr = earliestEmiDate ? earliestEmiDate.toISOString().slice(0, 10) : null;
      const emiDayName = earliestEmiDate ? dayNames[earliestEmiDate.getDay()] : null;
      const emiDayOfWeek = earliestEmiDate ? earliestEmiDate.getDay() : null;

      // Group meeting day preference
      const groupDay = center.groups?.find((g: any) => g.meetingDay)?.meetingDay || null;
      const effectiveMeetingDay = groupDay || emiDayName || 'MON';

      // Pending staff collection info
      const pInfo = pendingMap.get(center.id);

      // Confirmed collections today
      const cInfo = confirmedMap.get(center.id);
      const todayConfirmedCount = cInfo?.count || 0;
      const todayConfirmedTotal = cInfo?.amount || 0;
      const isPaidToday = activeLoansCount > 0 && todayConfirmedCount >= activeLoansCount;

      // Remove the large customers array to keep the payload small
      const { customers, ...rest } = center;
      return {
        ...rest,
        activeLoansCount,
        pendingSetupCount,
        totalOutstandingAmount,
        totalDemand,
        firstEmiDate: firstEmiDateStr,
        emiDayName,
        emiDayOfWeek,
        meetingDay: effectiveMeetingDay,
        branchName: center.area?.branch?.name || '',
        areaName: center.area?.name || '',
        groupsCount: center.groups?.length || 0,
        mappedCustomersCount: customers.filter((c) => c.centerMemberType !== 'IMPORT').length,
        importCustomersCount: customers.filter((c) => c.centerMemberType === 'IMPORT').length,
        actualMembersCount: customers.length,
        hasPendingSubmission: Boolean(pInfo && pInfo.count > 0),
        pendingSubmissionCount: pInfo?.count || 0,
        pendingSubmissionTotal: pInfo?.amount || 0,
        isPaidToday,
        todayConfirmedCount,
        todayConfirmedTotal,
        hasTodayConfirmed: todayConfirmedCount > 0,
      };
    });

    const shouldFilterActive = onlyActive === 'true' || user?.role?.name === 'Collection Staff';
    const finalCenters = shouldFilterActive
      ? enrichedCenters.filter((c) => (c.activeLoansCount || 0) > 0)
      : enrichedCenters;

    if (paginate === 'true') {
      return res.status(200).json(paginatedResponse(finalCenters, total, page, limit));
    }
    return res.status(200).json(finalCenters);
  } catch (error) {
    console.error('Error fetching centers:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getCenterById = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const center = await prisma.center.findUnique({
      where: { id: String(id) },
      include: { 
        employee: true, 
        area: true,
        customers: {
          include: {
            loans: {
              select: { status: true, outstandingAmount: true, firstDueDate: true, sanctionDate: true, createdAt: true }
            }
          }
        }
      }
    });
    if (!center) return res.status(404).json({ error: 'Center not found' });

    // Security check
    const user = (req as any).user;
    if (user?.role?.name !== 'Admin' && user?.branchId) {
      if (center.area?.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Security Violation: Cannot view a center outside your branch.' });
      }
    }

    let activeLoansCount = 0;
    let pendingSetupCount = 0;
    let totalOutstandingAmount = 0;
    let earliestEmiDate: any = null;
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

    center.customers.forEach(customer => {
      const openLoans = customer.loans.filter(l => LOAN_COLLECTIBLE_STATUSES.includes(l.status as typeof LOAN_COLLECTIBLE_STATUSES[number]));
      if (openLoans.length > 0) {
        activeLoansCount++;
        totalOutstandingAmount += openLoans.reduce((sum, l) => sum + (l.outstandingAmount || 0), 0);
        customer.loans.forEach(l => {
          if (LOAN_COLLECTIBLE_STATUSES.includes(l.status as typeof LOAN_COLLECTIBLE_STATUSES[number])) {
            const d = l.firstDueDate ? new Date(l.firstDueDate) : l.sanctionDate ? new Date(l.sanctionDate) : new Date(l.createdAt);
            if (!earliestEmiDate || d < earliestEmiDate) {
              earliestEmiDate = d;
            }
          }
        });
      } else if (!customer.loans.some(l => l.status === LoanStatus.PENDING)) {
        pendingSetupCount++;
      }
    });

    const firstEmiDateStr = earliestEmiDate ? earliestEmiDate.toISOString().slice(0, 10) : null;
    const emiDayName = earliestEmiDate ? dayNames[earliestEmiDate.getDay()] : null;
    const emiDayOfWeek = earliestEmiDate ? earliestEmiDate.getDay() : null;

    const { customers, ...rest } = center;

    return res.status(200).json({
      ...rest,
      customers,
      activeLoansCount,
      pendingSetupCount,
      totalOutstandingAmount,
      firstEmiDate: firstEmiDateStr,
      emiDayName,
      emiDayOfWeek,
      mappedCustomersCount: customers.filter((c) => c.centerMemberType !== 'IMPORT').length,
      actualMembersCount: customers.length,
      importCustomersCount: customers.filter((c) => c.centerMemberType === 'IMPORT').length,
    });
  } catch (error) {
    console.error('Error fetching center by id:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createCenter = async (req: Request, res: Response): Promise<any> => {
  try {
    if (await denyUnlessMenuPermission(req, res, MENU_PATH, 'canCreate')) return;

    const { name, centerTime, repaymentType, disbursMode, areaId, employeeId, totalMembers } = req.body;
    if (!name || !areaId) return res.status(400).json({ error: 'Name and Area are required' });

    const area = await prisma.area.findUnique({
      where: { id: areaId },
      include: { branch: true },
    });
    if (!area) return res.status(400).json({ error: 'Invalid area' });
    if (!area.branch) return res.status(400).json({ error: 'Area branch not found' });
    
    // Security check
    const user = (req as any).user;
    if (user?.role?.name !== 'Admin' && user?.branchId) {
      if (area.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Security Violation: Cannot create a center in an area outside your branch.' });
      }
    }

    if (employeeId) {
      const employee = await prisma.staff.findUnique({
        where: { id: employeeId },
        include: { area: true },
      });
      if (!employee) return res.status(400).json({ error: 'Invalid employee' });
      const empBranch = employee.branchId || employee.area?.branchId;
      if (empBranch && empBranch !== area.branchId) {
        return res.status(400).json({ error: 'Employee does not belong to this center branch' });
      }
    }

    // Auto-generate center code (branch-level, e.g. ANT001) and short code (customer-number prefix, e.g. JKA)
    const center = await prisma.$transaction(async (tx) => {
      const generatedCode = await generateCenterCodeInTx(tx, area.branch.code, area.branchId, area.branch.name);
      const shortCode = await allocateCenterShortCode(tx, null, name);
      return tx.center.create({
        data: {
          name,
          code: generatedCode,
          shortCode,
          centerTime: centerTime || null,
          repaymentType: repaymentType || 'WEEKLY',
          disbursMode: disbursMode || 'CASH',
          totalMembers: totalMembers ? parseInt(totalMembers) : 0,
          areaId,
          employeeId: employeeId || null,
        },
        include: { employee: true, area: true },
      });
    });
    return res.status(201).json(center);
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Center name or code already exists' });
    console.error('Error creating center:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateCenter = async (req: Request, res: Response): Promise<any> => {
  try {
    if (await denyUnlessMenuPermission(req, res, MENU_PATH, 'canEdit')) return;

    const { id } = req.params;
    // Center code is auto-generated and immutable — it is never accepted from the request on edit.
    const { name, centerTime, repaymentType, disbursMode, areaId, employeeId, isActive, totalMembers } = req.body as {
      name?: string; centerTime?: string;
      repaymentType?: string; disbursMode?: string; areaId?: string;
      employeeId?: string; isActive?: boolean; totalMembers?: any;
    };

    // Security check
    const existingCenter = await prisma.center.findUnique({ where: { id: String(id) }, include: { area: true } });
    if (!existingCenter) return res.status(404).json({ error: 'Center not found' });
    
    const user = (req as any).user;
    if (user?.role?.name !== 'Admin' && user?.branchId) {
      if (existingCenter.area?.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Security Violation: Cannot modify a center from another branch.' });
      }
      if (areaId && areaId !== existingCenter.areaId) {
        const newArea = await prisma.area.findUnique({ where: { id: areaId } });
        if (newArea && newArea.branchId !== user.branchId) {
          return res.status(403).json({ error: 'Security Violation: Cannot move center to an area outside your branch.' });
        }
      }
    }

    const targetAreaId = areaId ?? existingCenter.areaId;
    if (employeeId) {
      const employee = await prisma.staff.findUnique({
        where: { id: employeeId },
        include: { area: true },
      });
      const area = await prisma.area.findUnique({ where: { id: targetAreaId } });
      if (!employee) return res.status(400).json({ error: 'Invalid employee' });
      const empBranch = employee.branchId || employee.area?.branchId;
      if (area && empBranch && empBranch !== area.branchId) {
        return res.status(400).json({ error: 'Employee does not belong to this center branch' });
      }
    }

    if (totalMembers !== undefined) {
      const newLimit = parseInt(String(totalMembers), 10);
      if (!Number.isNaN(newLimit) && newLimit > 0) {
        const currentMembers = await countCenterMembers(prisma, String(id));
        if (currentMembers > newLimit) {
          return res.status(400).json({
            error: `Cannot set member limit to ${newLimit}. Center already has ${currentMembers} member(s).`,
          });
        }
      }
    }

    const center = await prisma.center.update({
      where: { id: String(id) },
      data: {
        ...(name !== undefined && { name }),
        ...(centerTime !== undefined && { centerTime }),
        ...(repaymentType !== undefined && { repaymentType }),
        ...(disbursMode !== undefined && { disbursMode }),
        ...(areaId !== undefined && { areaId }),
        ...(employeeId !== undefined && { employeeId: employeeId || null }),
        ...(isActive !== undefined && { isActive }),
        ...(totalMembers !== undefined && { totalMembers: parseInt(totalMembers) }),
      },
      include: { employee: true },
    });
    return res.status(200).json(center);
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Center not found' });
    console.error('Error updating center:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteCenter = async (req: Request, res: Response): Promise<any> => {
  try {
    if (await denyUnlessMenuPermission(req, res, MENU_PATH, 'canDelete')) return;

    const id = String(req.params.id);

    const existingCenter = await prisma.center.findUnique({ where: { id }, include: { area: true } });
    if (!existingCenter) return res.status(404).json({ error: 'Center not found' });

    const user = (req as any).user;
    if (user?.role?.name !== 'Admin' && user?.branchId) {
      if (existingCenter.area?.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Security Violation: Cannot delete a center from another branch.' });
      }
    }

    await prisma.center.delete({ where: { id } });
    return res.status(200).json({ message: 'Center deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Center not found' });
    const errStr = String(error);
    if (error.code === 'P2003' || error.code === 'P2014' || errStr.includes('foreign key constraint') || errStr.includes('23001')) {
      return res.status(400).json({ error: 'Cannot delete center because it has associated data' });
    }
    console.error('Error deleting center:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/** Move selected customers to a new center for second-loan import (IMPORT type — not counted as members). */
export const importCustomersToNewCenter = async (req: Request, res: Response): Promise<any> => {
  try {
    if (await denyUnlessMenuPermission(req, res, MENU_PATH, 'canCreate')) return;

    const { sourceCenterId, newCenterName, customerIds, importCount } = req.body as {
      sourceCenterId?: string;
      newCenterName?: string;
      customerIds?: string[];
      importCount?: number;
    };

    if (!sourceCenterId || !newCenterName?.trim()) {
      return res.status(400).json({ error: 'Source center and new center name are required' });
    }

    const sourceCenter = await prisma.center.findUnique({
      where: { id: sourceCenterId },
      include: {
        area: { include: { branch: true } },
        groups: { select: { meetingDay: true } },
        customers: {
          include: { loans: { select: { status: true } } },
        },
      },
    });

    if (!sourceCenter) return res.status(404).json({ error: 'Source center not found' });

    const user = (req as any).user;
    if (user?.role?.name !== 'Admin' && user?.branchId) {
      if (sourceCenter.area?.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Security Violation: Cannot import from a center outside your branch.' });
      }
    }

    const primary = sourceCenter.customers.filter((c) => c.centerMemberType !== 'IMPORT');
    const eligible = primary.length > 0 ? primary : sourceCenter.customers;

    let idsToImport: string[] = [];
    if (customerIds?.length) {
      idsToImport = customerIds.filter((id) => eligible.some((c) => c.id === id));
    } else if (importCount && importCount > 0) {
      idsToImport = eligible.slice(0, importCount).map((c) => c.id);
    }

    if (idsToImport.length === 0) {
      return res.status(400).json({ error: 'Select at least one customer from the source center to import.' });
    }

    const branchCode = sourceCenter.area?.branch?.code;
    const branchName = sourceCenter.area?.branch?.name;
    const branchId = sourceCenter.area?.branchId || sourceCenter.area?.branch?.id;
    if (!branchId || (!branchCode && !branchName)) {
      return res.status(400).json({ error: 'Source center branch not found' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const generatedCode = await generateCenterCodeInTx(tx, branchCode, branchId, branchName);
      const shortCode = await allocateCenterShortCode(tx, null, newCenterName.trim());
      const groupCodePrefix = generatedCode.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'CTR';

      const newCenter = await tx.center.create({
        data: {
          name: newCenterName.trim(),
          code: generatedCode,
          shortCode,
          centerTime: sourceCenter.centerTime,
          repaymentType: sourceCenter.repaymentType,
          disbursMode: sourceCenter.disbursMode,
          totalMembers: idsToImport.length,
          areaId: sourceCenter.areaId,
          employeeId: sourceCenter.employeeId,
        },
        include: { employee: true, area: true },
      });

      const sourceMeetingDay = sourceCenter.groups?.find((g: any) => g.meetingDay)?.meetingDay || null;
      const defaultGroup = await tx.group.create({
        data: {
          centerId: newCenter.id,
          groupName: 'Group 1',
          groupCode: `${groupCodePrefix}-G1`,
          meetingDay: sourceMeetingDay,
        },
      });

      // Auto-close open loans from previous cycle for all customers being transferred
      const previousOpenLoans = await tx.loan.findMany({
        where: {
          customerId: { in: idsToImport },
          status: { in: OPEN_LOAN_STATUSES },
        },
      });

      for (const loan of previousOpenLoans) {
        await handleManualLoanClose(tx, loan.id, loan.customerId, new Date());
        await tx.loan.update({
          where: { id: loan.id },
          data: {
            status: LoanStatus.CLOSED,
            remarks: (loan.remarks ? loan.remarks + ' | ' : '') + `Auto-closed on transfer to ${newCenterName.trim()}`,
            updatedAt: new Date(),
          },
        });
      }

      await tx.customer.updateMany({
        where: { id: { in: idsToImport } },
        data: {
          centerId: newCenter.id,
          centerMemberType: 'IMPORT',
          groupId: defaultGroup.id,
          updatedAt: new Date(),
        },
      });

      // Update source center totalMembers
      await tx.center.update({
        where: { id: sourceCenter.id },
        data: {
          totalMembers: Math.max(0, (sourceCenter.totalMembers || 0) - idsToImport.length),
          updatedAt: new Date(),
        },
      });

      return { newCenter, importedCount: idsToImport.length, groupId: defaultGroup.id };
    });

    return res.status(201).json(result);
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Center name or code already exists' });
    console.error('Error importing customers to new center:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/** Center collection sheet data for print & mobile portal — all members, contact details, attendance and collectible loans. */
export const getCenterCollectionSheet = async (req: Request, res: Response): Promise<any> => {
  try {
    const centerId = String(req.params.id);
    const collectionDate = typeof req.query.collectionDate === 'string' ? req.query.collectionDate : undefined;
    const center = await prisma.center.findUnique({
      where: { id: centerId },
      include: {
        area: { include: { branch: true } },
        employee: { select: { id: true, name: true, phone: true, username: true, staffNo: true } },
        groups: { select: { id: true, groupName: true, groupCode: true, meetingDay: true } },
        customers: {
          include: {
            group: { select: { id: true, groupName: true, groupCode: true } },
            loans: {
              where: { status: { in: LOAN_COLLECTIBLE_STATUSES } },
              include: {
                schedules: { orderBy: { dueDate: 'asc' } },
              },
            },
          },
          orderBy: { customerNo: 'asc' },
        },
      },
    });

    if (!center) return res.status(404).json({ error: 'Center not found' });

    const targetDay = toCollectionDay(collectionDate || new Date());
    const centerLoanIds = center.customers.flatMap((c) => c.loans.map((l) => l.id));

    // Query non-voided collections already recorded for this center's loans on targetDay
    const todayCollections = await prisma.collection.findMany({
      where: {
        loanId: { in: centerLoanIds },
        collectionDay: targetDay,
        isVoided: false,
      },
      select: {
        id: true,
        loanId: true,
        trnNumber: true,
        amount: true,
        trnDate: true,
        createdAt: true,
      },
    });
    const todayCollectionMap = new Map(todayCollections.map((c) => [c.loanId, c]));

    // Query pending staff entries for this center
    const pendingStaffEntries = await prisma.staffEntry.findMany({
      where: {
        centerId,
        status: 'PENDING',
      },
      select: {
        id: true,
        loanId: true,
        amount: true,
        status: true,
        createdAt: true,
        trnDate: true,
        staff: { select: { id: true, name: true } },
      },
    });
    const pendingMap = new Map(pendingStaffEntries.map((p) => [p.loanId, p]));
    const totalPendingSubmitted = pendingStaffEntries.reduce((sum, e) => sum + e.amount, 0);
    const pendingSubmittedCount = pendingStaffEntries.length;
    const totalTodayConfirmed = todayCollections.reduce((sum, c) => sum + c.amount, 0);
    const todayConfirmedCount = todayCollections.length;

    const rows = center.customers.flatMap((customer) =>
      customer.loans.map((loan) => {
        const todayCol = todayCollectionMap.get(loan.id);
        const isCollectedToday = Boolean(todayCol);
        const pending = pendingMap.get(loan.id);

        const demand = isCollectedToday
          ? 0
          : loanDemandForCollectionDate(
              loan.schedules || [],
              collectionDate,
              loan.perDueAmount,
              loan.outstandingAmount
            );

        return {
          customerId: customer.id,
          customerNo: customer.customerNo,
          customerName: customer.name,
          phone: customer.phone || customer.mobile || '',
          mobile: customer.mobile || customer.phone || '',
          address: customer.address || '',
          groupId: customer.groupId,
          groupName: customer.group?.groupName || 'Group A',
          loanId: loan.id,
          loanNumber: loan.loanNumber,
          amount: loan.amount,
          emi: loan.perDueAmount,
          demand,
          collected: isCollectedToday
            ? todayCol?.amount
            : (pending ? pending.amount : null),
          isCollectedToday,
          todayCollectionAmount: todayCol?.amount || null,
          todayTrnNumber: todayCol?.trnNumber || null,
          isSubmittedPending: Boolean(pending),
          pendingEntryId: pending?.id || null,
          pendingSubmittedAmount: pending?.amount || null,
          pendingSubmittedAt: pending?.createdAt || null,
          pendingStaffName: pending?.staff?.name || null,
          balance: loan.outstandingAmount,
          status: loan.status,
          hasActiveLoan: true,
        };
      })
    ).filter((row) => !collectionDate || row.demand > 0 || row.isCollectedToday || row.isSubmittedPending);

    const activeBorrowerCustomers = center.customers.filter((customer) => (customer.loans || []).length > 0);
    const allMembers = activeBorrowerCustomers.map((customer) => {
      const activeLoan = customer.loans[0];
      const totalBalance = customer.loans.reduce((sum, l) => sum + (l.outstandingAmount || 0), 0);
      return {
        id: customer.id,
        customerId: customer.id,
        customerNo: customer.customerNo,
        name: customer.name,
        customerName: customer.name,
        phone: customer.phone || customer.mobile || '',
        mobile: customer.mobile || customer.phone || '',
        address: customer.address || '',
        groupId: customer.groupId,
        groupName: customer.group?.groupName || 'Group A',
        centerMemberType: customer.centerMemberType,
        hasActiveLoan: true,
        loanId: activeLoan.id,
        loanNumber: activeLoan.loanNumber,
        loanAmount: activeLoan.amount,
        emi: activeLoan.perDueAmount,
        balance: totalBalance,
        status: activeLoan.status,
      };
    });

    let derivedMeetingDay = center.groups?.find((g) => g.meetingDay)?.meetingDay || null;
    let earliestDate: Date | null = null;
    for (const customer of center.customers) {
      for (const loan of customer.loans) {
        const d = loan.firstDueDate ? new Date(loan.firstDueDate) : loan.sanctionDate ? new Date(loan.sanctionDate) : new Date(loan.createdAt);
        if (!isNaN(d.getTime())) {
          if (!earliestDate || d < earliestDate) {
            earliestDate = d;
          }
        }
      }
    }
    if (!derivedMeetingDay && earliestDate) {
      derivedMeetingDay = DAY_NAMES[earliestDate.getDay()];
    }
    const meetingDay = derivedMeetingDay || 'MON';

    const stats = {
      totalMembers: allMembers.length,
      activeBorrowers: allMembers.length,
      totalDemand: rows.reduce((sum, r) => sum + (r.demand || 0), 0),
      totalOutstanding: allMembers.reduce((sum, m) => sum + (m.balance || 0), 0),
      centerTime: center.centerTime || '10:00 AM',
      repaymentType: center.repaymentType || 'WEEKLY',
      meetingDay,
      emiDayName: derivedMeetingDay,
      firstEmiDate: earliestDate ? earliestDate.toISOString().slice(0, 10) : null,
      groupsCount: center.groups?.length || 0,
      hasPendingSubmission: pendingStaffEntries.length > 0,
      pendingSubmittedTotal: totalPendingSubmitted,
      pendingSubmittedCount,
      hasTodayConfirmed: todayCollections.length > 0,
      todayConfirmedTotal: totalTodayConfirmed,
      todayConfirmedCount,
    };

    (center as any).meetingDay = meetingDay;
    (center as any).emiDayName = derivedMeetingDay;
    (center as any).firstEmiDate = earliestDate ? earliestDate.toISOString().slice(0, 10) : null;
    (center as any).hasPendingSubmission = pendingStaffEntries.length > 0;
    (center as any).pendingSubmittedTotal = totalPendingSubmitted;
    (center as any).pendingSubmittedCount = pendingSubmittedCount;
    (center as any).hasTodayConfirmed = todayCollections.length > 0;
    (center as any).todayConfirmedTotal = totalTodayConfirmed;
    (center as any).todayConfirmedCount = todayConfirmedCount;

    return res.status(200).json({
      center,
      employee: center.employee,
      rows,
      allMembers,
      stats,
      totalDemand: stats.totalDemand,
      collectionDate: collectionDate || null,
    });
  } catch (error) {
    console.error('Error fetching center collection sheet:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

function parseGroupIndex(name: string): number {
  const match = name.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 999;
}

export const getCenterJointLiabilitySheet = async (req: Request, res: Response): Promise<any> => {
  try {
    const centerId = String(req.params.id);
    const { groupId } = req.query;

    const center = await prisma.center.findUnique({
      where: { id: centerId },
      include: {
        area: { include: { branch: true } },
        groups: { orderBy: { groupName: 'asc' } },
        customers: {
          where: {
            centerMemberType: { not: 'IMPORT' },
            ...(groupId ? { groupId: String(groupId) } : {}),
          },
          include: {
            coApplicant: true,
            group: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!center) return res.status(404).json({ error: 'Center not found' });

    const user = (req as any).user;
    if (user?.role?.name !== 'Admin' && user?.branchId) {
      if (center.area?.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Security Violation: center is outside your branch.' });
      }
    }

    const centerAreaId = center.areaId;
    const members = center.customers.filter(
      (c) => c.centerMemberType !== 'IMPORT' && (!centerAreaId || c.areaId === centerAreaId)
    );

    const sortedGroups = [...center.groups].sort(
      (a, b) => parseGroupIndex(a.groupName) - parseGroupIndex(b.groupName)
    );

    const centerLeaderId = sortCustomersByRegistration(members)[0]?.id ?? null;

    const groupsPayload = (groupId
      ? sortedGroups.filter((g) => g.id === String(groupId))
      : sortedGroups
    )
      .map((g, idx) => ({
        id: g.id,
        groupName: g.groupName,
        shortLabel: g.groupCode || `G${parseGroupIndex(g.groupName) || idx + 1}`,
        customers: sortCustomersByRegistration(members.filter((c) => c.groupId === g.id)).map(
          (c) => ({
            id: c.id,
            name: c.name,
            customerNo: c.customerNo,
            coApplicantName: c.coApplicant?.name || '',
            isGroupLeader: c.id === centerLeaderId,
          })
        ),
      }))
      .filter((g) => g.customers.length > 0);

    const branch = center.area?.branch;
    return res.status(200).json({
      center: {
        id: center.id,
        name: center.name,
        code: center.code,
      },
      branch: branch
        ? {
            name: branch.name,
            location: branch.location,
            phone: branch.phone,
          }
        : null,
      groups: groupsPayload,
      printedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching joint liability sheet:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
