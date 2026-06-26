import { Request, Response } from 'express';
import prisma from '../../utils/prisma';
import { LOAN_COLLECTIBLE_STATUSES, LoanStatus, OPEN_LOAN_STATUSES } from '../../utils/prisma-enums';
import { countCenterMembers } from '../../utils/center-member.utils';
import { sumUnpaidFromSchedules } from '../../utils/loan.utils';
import { denyUnlessMenuPermission } from '../../utils/master-permissions';

const MENU_PATH = '/admin/masters/centers';

const generateCenterCode = async (name: string) => {
  const prefix = name.trim().replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase();
  const existing = await prisma.center.findMany({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
  });
  let nextNo = 1;
  if (existing.length > 0 && existing[0].code) {
    const lastNum = parseInt(existing[0].code.replace(prefix, ''), 10);
    if (!isNaN(lastNum)) nextNo = lastNum + 1;
  }
  return `${prefix}${nextNo.toString().padStart(3, '0')}`;
};

export const getCenters = async (req: Request, res: Response): Promise<any> => {
  try {
    const { branchId, staffId } = req.query;
    const user = (req as any).user;
    const userBranchId = user?.branchId;
    
    const whereClause: any = {};
    
    if (userBranchId) {
      whereClause.area = { branchId: userBranchId };
    } else if (branchId && branchId !== 'all') {
      whereClause.area = { branchId: String(branchId) };
    }

    if (staffId) {
      whereClause.employeeId = String(staffId);
    }
    
    const centers = await prisma.center.findMany({
      where: whereClause,
      include: { 
        employee: true, 
        area: true,
        customers: {
          include: {
            loans: {
              select: { status: true }
            }
          }
        }
      },
      orderBy: { name: 'asc' },
    });

    const enrichedCenters = centers.map(center => {
      let activeLoansCount = 0;
      let pendingSetupCount = 0;

      center.customers.forEach(customer => {
        const hasOpenLoan = customer.loans.some(l => LOAN_COLLECTIBLE_STATUSES.includes(l.status as typeof LOAN_COLLECTIBLE_STATUSES[number]));
        if (hasOpenLoan) {
          activeLoansCount++;
        } else if (!customer.loans.some(l => l.status === LoanStatus.PENDING)) {
          pendingSetupCount++;
        }
      });

      // Remove the large customers array to keep the payload small
      const { customers, ...rest } = center;
      return {
        ...rest,
        activeLoansCount,
        pendingSetupCount,
        mappedCustomersCount: customers.filter((c) => c.centerMemberType !== 'IMPORT').length,
        importCustomersCount: customers.filter((c) => c.centerMemberType === 'IMPORT').length,
      };
    });

    return res.status(200).json(enrichedCenters);
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
              select: { status: true, outstandingAmount: true }
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

    center.customers.forEach(customer => {
      const openLoans = customer.loans.filter(l => LOAN_COLLECTIBLE_STATUSES.includes(l.status as typeof LOAN_COLLECTIBLE_STATUSES[number]));
      if (openLoans.length > 0) {
        activeLoansCount++;
        totalOutstandingAmount += openLoans.reduce((sum, l) => sum + (l.outstandingAmount || 0), 0);
      } else if (!customer.loans.some(l => l.status === LoanStatus.PENDING)) {
        pendingSetupCount++;
      }
    });

    const { customers, ...rest } = center;

    return res.status(200).json({
      ...rest,
      customers,
      activeLoansCount,
      pendingSetupCount,
      totalOutstandingAmount,
      totalMembers: customers.filter((c) => c.centerMemberType !== 'IMPORT').length,
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
    
    // Security check
    const user = (req as any).user;
    if (user?.role?.name !== 'Admin' && user?.branchId) {
      const area = await prisma.area.findUnique({ where: { id: areaId } });
      if (!area || area.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Security Violation: Cannot create a center in an area outside your branch.' });
      }
    }

    // Auto-generate center code from name (e.g. "Sattur" → SAT001)
    const generatedCode = await generateCenterCode(name);

    if (employeeId) {
      const employee = await prisma.staff.findUnique({
        where: { id: employeeId },
        include: { area: true },
      });
      const area = await prisma.area.findUnique({ where: { id: areaId } });
      if (!employee) return res.status(400).json({ error: 'Invalid employee' });
      const empBranch = employee.branchId || employee.area?.branchId;
      if (area && empBranch && empBranch !== area.branchId) {
        return res.status(400).json({ error: 'Employee does not belong to this center branch' });
      }
    }

    const center = await prisma.center.create({
      data: {
        name,
        code: generatedCode,
        centerTime: centerTime || null,
        repaymentType: repaymentType || 'WEEKLY',
        disbursMode: disbursMode || 'CASH',
        totalMembers: totalMembers ? parseInt(totalMembers) : 0,
        areaId,
        employeeId: employeeId || null,
      },
      include: { employee: true, area: true },
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
    const { name, code, centerTime, repaymentType, disbursMode, areaId, employeeId, isActive, totalMembers } = req.body as {
      name?: string; code?: string; centerTime?: string;
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
        ...(code !== undefined && { code }),
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
        area: true,
        customers: {
          where: { centerMemberType: { not: 'IMPORT' } },
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

    const eligible = sourceCenter.customers.filter((c) =>
      !c.loans.some((l) => OPEN_LOAN_STATUSES.includes(l.status as typeof OPEN_LOAN_STATUSES[number]))
    );

    let idsToImport: string[] = [];
    if (customerIds?.length) {
      idsToImport = customerIds.filter((id) => eligible.some((c) => c.id === id));
    } else if (importCount && importCount > 0) {
      idsToImport = eligible.slice(0, importCount).map((c) => c.id);
    }

    if (idsToImport.length === 0) {
      return res.status(400).json({ error: 'No eligible customers to import. Customers need a closed first loan or no active loan.' });
    }

    const generatedCode = await generateCenterCode(newCenterName.trim());

    const result = await prisma.$transaction(async (tx) => {
      const newCenter = await tx.center.create({
        data: {
          name: newCenterName.trim(),
          code: generatedCode,
          centerTime: sourceCenter.centerTime,
          repaymentType: sourceCenter.repaymentType,
          disbursMode: sourceCenter.disbursMode,
          totalMembers: 0,
          areaId: sourceCenter.areaId,
          employeeId: sourceCenter.employeeId,
        },
        include: { employee: true, area: true },
      });

      await tx.customer.updateMany({
        where: { id: { in: idsToImport } },
        data: {
          centerId: newCenter.id,
          centerMemberType: 'IMPORT',
          groupId: null,
        },
      });

      return { newCenter, importedCount: idsToImport.length };
    });

    return res.status(201).json(result);
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Center name or code already exists' });
    console.error('Error importing customers to new center:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/** Center collection sheet data for print — all members with collectible loans. */
export const getCenterCollectionSheet = async (req: Request, res: Response): Promise<any> => {
  try {
    const centerId = String(req.params.id);
    const center = await prisma.center.findUnique({
      where: { id: centerId },
      include: {
        area: { include: { branch: true } },
        employee: { select: { name: true, phone: true, username: true } },
        customers: {
          include: {
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

    const user = (req as any).user;
    if (user?.role?.name !== 'Admin' && user?.branchId) {
      if (center.area?.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Security Violation: center is outside your branch.' });
      }
    }

    const rows = center.customers.flatMap((customer) =>
      customer.loans.map((loan) => {
        const scheduleDue = sumUnpaidFromSchedules(loan.schedules || []);
        const demand =
          scheduleDue > 0
            ? scheduleDue
            : Math.min(loan.outstandingAmount, loan.perDueAmount || loan.outstandingAmount);
        return {
          customerId: customer.id,
          customerNo: customer.customerNo,
          customerName: customer.name,
          loanId: loan.id,
          loanNumber: loan.loanNumber,
          emi: loan.perDueAmount,
          demand,
          collected: null as number | null,
          balance: loan.outstandingAmount,
          status: loan.status,
        };
      })
    );

    return res.status(200).json({
      center,
      employee: center.employee,
      rows,
      totalDemand: rows.reduce((sum, r) => sum + (r.demand || 0), 0),
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

/** Group loan joint liability print data — members grouped by G1, G2, … */
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

    const groupsPayload = (groupId
      ? sortedGroups.filter((g) => g.id === String(groupId))
      : sortedGroups
    )
      .map((g, idx) => ({
        id: g.id,
        groupName: g.groupName,
        shortLabel: g.groupCode || `G${parseGroupIndex(g.groupName) || idx + 1}`,
        customers: members
          .filter((c) => c.groupId === g.id)
          .map((c) => ({
            id: c.id,
            name: c.name,
            customerNo: c.customerNo,
            coApplicantName: c.coApplicant?.name || '',
          })),
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
