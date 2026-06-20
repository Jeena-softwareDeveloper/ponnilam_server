import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireBranchAccess } from '../../utils/security.utils';

const prisma = new PrismaClient();

// Generate Customer Number with branch prefix (e.g., PON001 for branch "Ponnilam")
const generateCustomerNo = async (branchId?: string) => {
  let prefix = 'CUS'; // fallback prefix
  if (branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (branch?.name) {
      prefix = branch.name.trim().replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase();
    }
  }
  // Find last customer with this prefix to get next sequential number
  const existing = await prisma.customer.findMany({
    where: { customerNo: { startsWith: prefix } },
    orderBy: { customerNo: 'desc' },
  });
  let nextNo = 1;
  if (existing.length > 0 && existing[0].customerNo) {
    const lastNum = parseInt(existing[0].customerNo.replace(prefix, ''), 10);
    if (!isNaN(lastNum)) nextNo = lastNum + 1;
  }
  return `${prefix}${nextNo.toString().padStart(3, '0')}`;
};

export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
    const {
      general,
      coApplicant,
      kyc,
      bank,
      others
    } = req.body;

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

    // Security Check: Enforce Branch Scoping
    const user = (req as any).user;
    if (general?.areaId) {
      const area = await prisma.area.findUnique({ where: { id: general.areaId } });
      if (!area) throw new Error('Invalid area selected');
      requireBranchAccess(user, area.branchId, 'create entries outside your assigned branch');
    }

    // Get the branchId for this customer (from area or logged-in user)
    let branchIdForNo: string | undefined;
    if (general?.areaId) {
      const area = await prisma.area.findUnique({ where: { id: general.areaId } });
      branchIdForNo = area?.branchId || undefined;
    } else if (user?.branchId) {
      branchIdForNo = user.branchId;
    }

    const customerNo = await generateCustomerNo(branchIdForNo);

    const customer = await prisma.customer.create({
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
        areaId: general.areaId || null,
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

    res.status(201).json(customer);
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
    // Check if they have access to the EXISTING customer's branch
    requireBranchAccess(user, existingCustomer.area?.branchId, 'modify a customer from another branch');
    
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
    const { search, areaId, centerId, branchId } = req.query;

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
    }

    const customers = await prisma.customer.findMany({
      where,
      include: {
        area: true,
        group: true,
        employee: true,
        center: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(customers);
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
        loans: {
          include: {
            schedules: { orderBy: { dueDate: 'asc' } },
            collections: { orderBy: { trnDate: 'desc' } }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!customer) {
      throw new Error('Customer not found or unauthorized');
    }

    res.json(customer);
});

export const deleteCustomer = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await prisma.customer.delete({ where: { id: String(id) } });
    res.json({ message: 'Customer deleted successfully' });
});

export const toggleCustomerStatus = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const customer = await prisma.customer.findUnique({ where: { id: String(id) } });
    if (!customer) throw new Error('Customer not found');

    const updated = await prisma.customer.update({
      where: { id: String(id) },
      data: { isActive: !customer.isActive }
    });
    res.json({ message: `Customer ${updated.isActive ? 'activated' : 'deactivated'} successfully`, isActive: updated.isActive });
});
