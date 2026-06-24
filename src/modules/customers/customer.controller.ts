import prisma from '../../utils/prisma';
import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireBranchAccess } from '../../utils/security.utils';
import { OPEN_LOAN_STATUSES } from '../../utils/prisma-enums';
import { nextCustomerNo } from '../../utils/sequence.utils';
import { parsePagination, paginatedResponse } from '../../utils/pagination.utils';
import { validateCenterMemberLimit, validateCustomerCenterAssignment } from '../../utils/center-member.utils';
import { assertMenuPermission, checkAreaScope, isValidMobile, resolveStaffId } from '../../utils/validation.helpers';

export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
  try {
    const {
      general,
      coApplicant,
      kyc,
      bank,
      others
    } = req.body;

    if (!general?.name) {
      return res.status(400).json({ error: 'Customer name is required' });
    }
    if (!general?.mobile) {
      return res.status(400).json({ error: 'Customer mobile number is required' });
    }
    if (!isValidMobile(general.mobile)) {
      return res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });
    }
    if (!general?.centerId) {
      return res.status(400).json({ error: 'Center is required' });
    }

    const user = (req as any).user;
    const createPerm = await assertMenuPermission(user, '/admin/customers', 'canCreate');
    if (createPerm) return res.status(403).json({ error: createPerm });

    let resolvedAreaId = general.areaId;
    if (general?.centerId) {
      const center = await prisma.center.findUnique({ where: { id: general.centerId } });
      if (!center) return res.status(400).json({ error: 'Invalid center selected' });
      if (!center.isActive) return res.status(400).json({ error: 'Selected center is inactive' });
      resolvedAreaId = center.areaId;
      if (general.areaId && center.areaId !== general.areaId) {
        return res.status(400).json({ error: 'Center does not belong to the selected area' });
      }
      const centerCheck = await validateCustomerCenterAssignment(prisma, general.centerId, resolvedAreaId);
      if (!centerCheck.ok) return res.status(400).json({ error: centerCheck.error });
      const memberCheck = await validateCenterMemberLimit(prisma, general.centerId, {
        memberType: general.centerMemberType,
      });
      if (!memberCheck.ok) return res.status(400).json({ error: memberCheck.error });
    }
    if (!resolvedAreaId) {
      return res.status(400).json({ error: 'Customer area is required' });
    }

    if (kyc?.idProof1No) {
      const existing1 = await prisma.customerKyc.findFirst({
        where: { OR: [{ idProof1No: kyc.idProof1No }, { idProof2No: kyc.idProof1No }] }
      });
      if (existing1) return res.status(400).json({ error: `Customer with ID Proof Number ${kyc.idProof1No} already exists.` });
    }

    if (kyc?.idProof2No) {
      const existing2 = await prisma.customerKyc.findFirst({
        where: { OR: [{ idProof1No: kyc.idProof2No }, { idProof2No: kyc.idProof2No }] }
      });
      if (existing2) return res.status(400).json({ error: `Customer with ID Proof Number ${kyc.idProof2No} already exists.` });
    }

    if (general?.groupId) {
      const group = await prisma.group.findUnique({ where: { id: general.groupId }, include: { center: true } });
      if (!group) return res.status(400).json({ error: 'Invalid group selected' });
      if (!group.isActive) return res.status(400).json({ error: 'Selected group is inactive' });
      if (!general.centerId || group.centerId !== general.centerId) {
        return res.status(400).json({ error: 'Group does not belong to the selected center' });
      }
      if (group.center?.areaId !== resolvedAreaId) {
        return res.status(400).json({ error: 'Group does not belong to the customer area' });
      }
    }

    const area = await prisma.area.findUnique({ where: { id: resolvedAreaId } });
    if (!area) return res.status(400).json({ error: 'Invalid area selected' });
    const areaScopeErr = checkAreaScope(user, res.locals.areaIds, resolvedAreaId);
    if (areaScopeErr) return res.status(403).json({ error: areaScopeErr });
    requireBranchAccess(user, area.branchId, 'create entries outside your assigned branch');

    if (general?.employeeId) {
      const staffCheck = await resolveStaffId(general.employeeId, user, { fallbackToUser: false });
      if ('error' in staffCheck) return res.status(400).json({ error: staffCheck.error });
    }

    const branchIdForNo = area.branchId || user?.branchId || undefined;

    const customer = await prisma.$transaction(async (tx) => {
      const customerNo = await nextCustomerNo(tx, branchIdForNo);
      return tx.customer.create({
      data: {
        customerNo,
        name: general.name,
        dob: general.dob ? new Date(general.dob) : null,
        placeOfBirth: general.placeOfBirth,
        maritalStatus: general.maritalStatus,
        address: general.address,
        residenceType: general.residenceType,
        yearsInResidence: general.yearsInResidence ? Number(general.yearsInResidence) : null,
        occupation: general.occupation,
        phone: general.phone,
        mobile: general.mobile,
        areaId: resolvedAreaId,
        centerId: general.centerId || null,
        groupId: general.groupId || null,
        employeeId: general.employeeId || null,

        familyMembers: others?.familyMembers ? Number(others.familyMembers) : 0,
        fatherName: others?.fatherName,
        motherName: others?.motherName,
        fatherDob: others?.fatherDob ? new Date(others.fatherDob) : null,
        motherDob: others?.motherDob ? new Date(others.motherDob) : null,

        coApplicant: coApplicant && Object.keys(coApplicant).length > 0 ? {
          create: {
            name: coApplicant.name,
            dob: coApplicant.dob ? new Date(coApplicant.dob) : null,
            relationship: coApplicant.relationship,
            occupation: coApplicant.occupation
          }
        } : undefined,

        kyc: kyc && Object.keys(kyc).length > 0 ? {
          create: {
            idProof1Type: kyc.idProof1Type,
            idProof1No: kyc.idProof1No,
            idProof1Name: kyc.idProof1Name,
            idProof1Dob: kyc.idProof1Dob ? new Date(kyc.idProof1Dob) : null,
            idProof1IssueDate: kyc.idProof1IssueDate ? new Date(kyc.idProof1IssueDate) : null,
            idProof2Type: kyc.idProof2Type,
            idProof2No: kyc.idProof2No,
            idProof2Name: kyc.idProof2Name,
            idProof2Dob: kyc.idProof2Dob ? new Date(kyc.idProof2Dob) : null,
            idProof2IssueDate: kyc.idProof2IssueDate ? new Date(kyc.idProof2IssueDate) : null,
          }
        } : undefined,

        bank: bank && Object.keys(bank).length > 0 ? {
          create: {
            accountHolder: bank.accountHolder,
            accountNumber: bank.accountNumber,
            ifsc: bank.ifsc,
            bankName: bank.bankName,
            branchName: bank.branchName
          }
        } : undefined
      },
      include: {
        area: true,
        group: true,
        employee: true,
        coApplicant: true,
        kyc: true,
        bank: true
      }
    });
    });

    res.status(201).json(customer);
  } catch (error: any) {
    if (error.code === 'P2002') {
      const target = error.meta?.target;
      const field = Array.isArray(target) ? target[0] : 'field';
      return res.status(409).json({ error: `A customer with this ${field} already exists.` });
    }
    throw error;
  }
});

export const updateCustomer = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
      general,
      coApplicant,
      kyc,
      bank,
      others
    } = req.body;

    const existingCustomer = await prisma.customer.findUnique({
      where: { id: id as string },
      include: { area: true }
    }) as any;

    if (!existingCustomer) {
      throw new Error('Customer not found');
    }

    const user = (req as any).user;
    const editPerm = await assertMenuPermission(user, '/admin/customers', 'canEdit');
    if (editPerm) return res.status(403).json({ error: editPerm });
    requireBranchAccess(user, existingCustomer.area?.branchId, 'modify a customer from another branch');
    const areaScopeErr = checkAreaScope(user, res.locals.areaIds, existingCustomer.areaId);
    if (areaScopeErr) return res.status(403).json({ error: areaScopeErr });
    
    // Check if they are trying to move the customer to a new area outside their branch
    if (general?.areaId && general.areaId !== existingCustomer.areaId) {
      const newArea = await prisma.area.findUnique({ where: { id: general.areaId } });
      requireBranchAccess(user, newArea?.branchId, 'move customer to an area outside your assigned branch');
    }

    if (kyc?.idProof1No) {
      const existing1 = await prisma.customerKyc.findFirst({
        where: { 
          customerId: { not: String(id) },
          OR: [{ idProof1No: kyc.idProof1No }, { idProof2No: kyc.idProof1No }] 
        }
      });
      if (existing1) return res.status(400).json({ error: `Customer with ID Proof Number ${kyc.idProof1No} already exists.` });
    }

    if (kyc?.idProof2No) {
      const existing2 = await prisma.customerKyc.findFirst({
        where: { 
          customerId: { not: String(id) },
          OR: [{ idProof1No: kyc.idProof2No }, { idProof2No: kyc.idProof2No }] 
        }
      });
      if (existing2) return res.status(400).json({ error: `Customer with ID Proof Number ${kyc.idProof2No} already exists.` });
    }

    const updateData: any = {};
    
    if (general) {
      if (general.areaId !== undefined && general.areaId !== existingCustomer.areaId) {
        const oldArea = existingCustomer.area;
        const newArea = await prisma.area.findUnique({ where: { id: general.areaId } });
        if (!newArea) return res.status(400).json({ error: 'Invalid area selected' });
        if (oldArea?.branchId !== newArea.branchId) {
          return res.status(400).json({ error: 'Customer cannot be moved to another branch.' });
        }
        return res.status(400).json({ error: 'Customer area cannot be changed after registration.' });
      }

      if (general.centerId !== undefined) {
        const newCenterId = general.centerId || null;
        const centerChanged = newCenterId !== existingCustomer.centerId;

        if (centerChanged) {
          if (newCenterId) {
            return res.status(400).json({
              error: 'Customer cannot be moved to another center. Use Import for Second Loan if needed.',
            });
          }
          const openLoan = await prisma.loan.findFirst({
            where: { customerId: String(id), status: { in: OPEN_LOAN_STATUSES } },
          });
          if (openLoan) {
            return res.status(400).json({ error: 'Cannot remove customer from center while they have an active loan.' });
          }
        }
      }

      if (general.groupId !== undefined && general.groupId) {
        const group = await prisma.group.findUnique({ where: { id: general.groupId }, include: { center: true } });
        if (!group) return res.status(400).json({ error: 'Invalid group selected' });
        if (!group.isActive) return res.status(400).json({ error: 'Selected group is inactive' });
        const customerCenterId = general.centerId !== undefined ? general.centerId : existingCustomer.centerId;
        if (!customerCenterId || group.centerId !== customerCenterId) {
          return res.status(400).json({ error: 'Group does not belong to the customer center' });
        }
      }
      if (general.employeeId !== undefined && general.employeeId) {
        const staffCheck = await resolveStaffId(general.employeeId, user, { fallbackToUser: false });
        if ('error' in staffCheck) return res.status(400).json({ error: staffCheck.error });
      }

      if (general.name !== undefined) updateData.name = general.name;
      if (general.dob !== undefined) updateData.dob = general.dob ? new Date(general.dob) : null;
      if (general.placeOfBirth !== undefined) updateData.placeOfBirth = general.placeOfBirth;
      if (general.maritalStatus !== undefined) updateData.maritalStatus = general.maritalStatus;
      if (general.address !== undefined) updateData.address = general.address;
      if (general.residenceType !== undefined) updateData.residenceType = general.residenceType;
      if (general.yearsInResidence !== undefined) updateData.yearsInResidence = general.yearsInResidence ? Number(general.yearsInResidence) : null;
      if (general.occupation !== undefined) updateData.occupation = general.occupation;
      if (general.phone !== undefined) updateData.phone = general.phone;
      if (general.mobile !== undefined) updateData.mobile = general.mobile;
      if (general.areaId !== undefined) updateData.areaId = general.areaId || null;
      if (general.centerId !== undefined) updateData.centerId = general.centerId || null;
      if (general.groupId !== undefined) updateData.groupId = general.groupId || null;
      if (general.employeeId !== undefined) updateData.employeeId = general.employeeId || null;
    }

    if (others) {
      if (others.familyMembers !== undefined) updateData.familyMembers = others.familyMembers ? Number(others.familyMembers) : 0;
      if (others.fatherName !== undefined) updateData.fatherName = others.fatherName;
      if (others.motherName !== undefined) updateData.motherName = others.motherName;
      if (others.fatherDob !== undefined) updateData.fatherDob = others.fatherDob ? new Date(others.fatherDob) : null;
      if (others.motherDob !== undefined) updateData.motherDob = others.motherDob ? new Date(others.motherDob) : null;
    }

    if (coApplicant && Object.keys(coApplicant).length > 0) {
      updateData.coApplicant = {
        upsert: {
          create: {
            name: coApplicant.name,
            dob: coApplicant.dob ? new Date(coApplicant.dob) : null,
            relationship: coApplicant.relationship,
            occupation: coApplicant.occupation
          },
          update: {
            name: coApplicant.name,
            dob: coApplicant.dob ? new Date(coApplicant.dob) : null,
            relationship: coApplicant.relationship,
            occupation: coApplicant.occupation
          }
        }
      };
    }

    if (kyc && Object.keys(kyc).length > 0) {
      updateData.kyc = {
        upsert: {
          create: {
            idProof1Type: kyc.idProof1Type,
            idProof1No: kyc.idProof1No,
            idProof1Name: kyc.idProof1Name,
            idProof1Dob: kyc.idProof1Dob ? new Date(kyc.idProof1Dob) : null,
            idProof1IssueDate: kyc.idProof1IssueDate ? new Date(kyc.idProof1IssueDate) : null,
            idProof2Type: kyc.idProof2Type,
            idProof2No: kyc.idProof2No,
            idProof2Name: kyc.idProof2Name,
            idProof2Dob: kyc.idProof2Dob ? new Date(kyc.idProof2Dob) : null,
            idProof2IssueDate: kyc.idProof2IssueDate ? new Date(kyc.idProof2IssueDate) : null,
          },
          update: {
            idProof1Type: kyc.idProof1Type,
            idProof1No: kyc.idProof1No,
            idProof1Name: kyc.idProof1Name,
            idProof1Dob: kyc.idProof1Dob ? new Date(kyc.idProof1Dob) : null,
            idProof1IssueDate: kyc.idProof1IssueDate ? new Date(kyc.idProof1IssueDate) : null,
            idProof2Type: kyc.idProof2Type,
            idProof2No: kyc.idProof2No,
            idProof2Name: kyc.idProof2Name,
            idProof2Dob: kyc.idProof2Dob ? new Date(kyc.idProof2Dob) : null,
            idProof2IssueDate: kyc.idProof2IssueDate ? new Date(kyc.idProof2IssueDate) : null,
          }
        }
      };
    }

    if (bank && Object.keys(bank).length > 0) {
      updateData.bank = {
        upsert: {
          create: {
            accountHolder: bank.accountHolder,
            accountNumber: bank.accountNumber,
            ifsc: bank.ifsc,
            bankName: bank.bankName,
            branchName: bank.branchName
          },
          update: {
            accountHolder: bank.accountHolder,
            accountNumber: bank.accountNumber,
            ifsc: bank.ifsc,
            bankName: bank.bankName,
            branchName: bank.branchName
          }
        }
      };
    }

    const customer = await prisma.customer.update({
      where: { id: String(id) },
      data: updateData,
      include: {
        area: true,
        group: true,
        employee: true,
        coApplicant: true,
        kyc: true,
        bank: true
      }
    });

    res.json(customer);
});

export const getCustomers = asyncHandler(async (req: Request, res: Response) => {
    const { search, areaId, centerId, branchId, withoutActiveLoan } = req.query;

    const where: any = {};
    
    if (search) {
      where.OR = [
        { name: { contains: String(search) } },
        { mobile: { contains: String(search) } },
        { customerNo: { contains: String(search) } }
      ];
    }
    
    const user = (req as any).user;
    const userBranchId = user?.branchId;

    if (res.locals.areaIds && res.locals.areaIds.length > 0) {
      where.areaId = { in: res.locals.areaIds };
    } else if (userBranchId) {
      where.area = { branchId: userBranchId, ...(areaId ? { id: String(areaId) } : {}) };
    } else if (areaId) {
      where.areaId = String(areaId);
    } else if (branchId && branchId !== 'all') {
      where.area = { branchId: String(branchId) };
    }

    if (centerId) {
      where.centerId = String(centerId);
      const center = await prisma.center.findUnique({ where: { id: String(centerId) } });
      if (center) {
        where.areaId = center.areaId;
      }
    }

    if (withoutActiveLoan === 'true') {
      where.loans = {
        none: {
          status: {
            in: OPEN_LOAN_STATUSES
          }
        }
      };
    }

    const { page, limit, skip } = parsePagination(req.query as Record<string, string>);

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        include: {
          area: true,
          group: true,
          employee: true,
          center: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.customer.count({ where }),
    ]);

    res.json(paginatedResponse(customers, total, page, limit));
});

export const getCustomerById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const where: any = { id: String(id) };
    
    if (res.locals.areaIds && res.locals.areaIds.length > 0) {
      where.areaId = { in: res.locals.areaIds };
    }

    const customer = await prisma.customer.findFirst({
      where,
      include: {
        area: true,
        group: true,
        employee: true,
        coApplicant: true,
        kyc: true,
        bank: true
      }
    });

    if (!customer) {
      throw new Error('Customer not found or unauthorized');
    }

    res.json(customer);
});

export const getCustomerLedger = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const where: any = { id: String(id) };
    
    if (res.locals.areaIds && res.locals.areaIds.length > 0) {
      where.areaId = { in: res.locals.areaIds };
    }

    const customer = await prisma.customer.findFirst({
      where,
      include: {
        area: true,
        employee: true,
        center: true,
      }
    });

    if (!customer) {
      throw new Error('Customer not found or unauthorized');
    }

    const ledger = await prisma.customerLedger.findMany({
      where: { customerId: customer.id },
      include: {
        collection: { select: { trnNumber: true, trnDate: true } },
      },
      orderBy: { date: 'asc' },
    });

    const loans = await prisma.loan.findMany({
      where: { customerId: customer.id },
      include: {
        schedules: { orderBy: { dueDate: 'asc' } },
        collections: { orderBy: { trnDate: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ customer, ledger, loans });
});

export const deleteCustomer = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    
    const customer = await prisma.customer.findUnique({
      where: { id: String(id) },
      include: {
        area: true,
        loans: { select: { id: true, loanNumber: true, status: true, outstandingAmount: true } },
      },
    });
    
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const user = (req as any).user;
    const deletePerm = await assertMenuPermission(user, '/admin/customers', 'canDelete');
    if (deletePerm) return res.status(403).json({ error: deletePerm });
    requireBranchAccess(user, customer.area?.branchId, 'delete a customer from another branch');
    const areaScopeErr = checkAreaScope(user, res.locals.areaIds, customer.areaId);
    if (areaScopeErr) return res.status(403).json({ error: areaScopeErr });

    const openLoans = customer.loans.filter(
      (l) => l.outstandingAmount > 0 || OPEN_LOAN_STATUSES.includes(l.status as typeof OPEN_LOAN_STATUSES[number])
    );
    if (openLoans.length > 0) {
      return res.status(400).json({
        error: `Cannot delete customer. ${openLoans.length} open loan(s) exist. Close or drop them first.`,
      });
    }

    if (customer.loans.length > 0) {
      return res.status(400).json({
        error: `Cannot delete customer with loan history (${customer.loans.length} loan record(s)). Deactivate the customer instead.`,
      });
    }
    
    await prisma.customer.delete({ where: { id: String(id) } });
    res.json({ message: 'Customer deleted successfully' });
});

export const toggleCustomerStatus = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const customer = await prisma.customer.findUnique({
      where: { id: String(id) },
      include: { area: true, loans: { where: { status: { in: OPEN_LOAN_STATUSES } } } },
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const user = (req as any).user;
    const editPerm = await assertMenuPermission(user, '/admin/customers', 'canEdit');
    if (editPerm) return res.status(403).json({ error: editPerm });
    requireBranchAccess(user, customer.area?.branchId, 'update a customer outside your branch');
    const areaScopeErr = checkAreaScope(user, res.locals.areaIds, customer.areaId);
    if (areaScopeErr) return res.status(403).json({ error: areaScopeErr });

    if (customer.isActive && customer.loans.length > 0) {
      return res.status(400).json({ error: 'Cannot deactivate customer with open loans' });
    }

    const updated = await prisma.customer.update({
      where: { id: String(id) },
      data: { isActive: !customer.isActive }
    });
    res.json({ message: `Customer ${updated.isActive ? 'activated' : 'deactivated'} successfully`, isActive: updated.isActive });
});
