import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Generate Customer Number (e.g., CUST0001)
const generateCustomerNo = async () => {
  const lastCustomer = await prisma.customer.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  if (!lastCustomer || !lastCustomer.customerNo) {
    return 'CUST0001';
  }

  const lastNo = parseInt(lastCustomer.customerNo.replace('CUST', ''), 10);
  const nextNo = (lastNo + 1).toString().padStart(4, '0');
  return `CUST${nextNo}`;
};

export const createCustomer = async (req: Request, res: Response) => {
  try {
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
    if (general?.areaId && user?.role?.name !== 'Super Admin' && user?.branchId) {
      const area = await prisma.area.findUnique({ where: { id: general.areaId } });
      if (!area) return res.status(400).json({ error: 'Invalid area selected' });
      if (area.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Security Violation: You are not authorized to create entries outside your assigned branch.' });
      }
    }

    const customerNo = await generateCustomerNo();

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
  } catch (error) {
    console.error('Create Customer Error:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
};

export const updateCustomer = async (req: Request, res: Response) => {
  try {
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
      return res.status(404).json({ error: 'Customer not found' });
    }

    const user = (req as any).user;
    if (user?.role?.name !== 'Super Admin' && user?.branchId) {
      // Check if they have access to the EXISTING customer's branch
      if (existingCustomer.area?.branchId && existingCustomer.area.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Security Violation: You are not authorized to modify a customer from another branch.' });
      }
      // Check if they are trying to move the customer to a new area outside their branch
      if (general?.areaId && general.areaId !== existingCustomer.areaId) {
        const newArea = await prisma.area.findUnique({ where: { id: general.areaId } });
        if (newArea && newArea.branchId !== user.branchId) {
          return res.status(403).json({ error: 'Security Violation: Cannot move customer to an area outside your assigned branch.' });
        }
      }
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
  } catch (error) {
    console.error('Update Customer Error:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
};

export const getCustomers = async (req: Request, res: Response) => {
  try {
    const { search, areaId, centerId, branchId } = req.query;

    const where: any = {};
    
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { mobile: { contains: String(search), mode: 'insensitive' } },
        { customerNo: { contains: String(search), mode: 'insensitive' } }
      ];
    }
    
    if (res.locals.areaIds && res.locals.areaIds.length > 0) {
      where.areaId = { in: res.locals.areaIds };
    } else if (areaId) {
      where.areaId = String(areaId);
    } else if (branchId) {
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
        employee: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(customers);
  } catch (error) {
    console.error('Get Customers Error:', error);
    res.status(500).json({ error: 'Failed to get customers' });
  }
};

export const getCustomerById = async (req: Request, res: Response) => {
  try {
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
      return res.status(404).json({ error: 'Customer not found or unauthorized' });
    }

    res.json(customer);
  } catch (error) {
    console.error('Get Customer Error:', error);
    res.status(500).json({ error: 'Failed to get customer details' });
  }
};

export const getCustomerLedger = async (req: Request, res: Response) => {
  try {
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
      return res.status(404).json({ error: 'Customer not found or unauthorized' });
    }

    res.json(customer);
  } catch (error) {
    console.error('Get Customer Ledger Error:', error);
    res.status(500).json({ error: 'Failed to get customer ledger' });
  }
};

export const deleteCustomer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.customer.delete({ where: { id: String(id) } });
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Delete Customer Error:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
};

export const toggleCustomerStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const customer = await prisma.customer.findUnique({ where: { id: String(id) } });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const updated = await prisma.customer.update({
      where: { id: String(id) },
      data: { isActive: !customer.isActive }
    });
    res.json({ message: `Customer ${updated.isActive ? 'activated' : 'deactivated'} successfully`, isActive: updated.isActive });
  } catch (error) {
    console.error('Toggle Customer Status Error:', error);
    res.status(500).json({ error: 'Failed to update customer status' });
  }
};
