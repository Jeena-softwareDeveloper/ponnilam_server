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
        occupation: general.occupation,
        phone: general.phone,
        mobile: general.mobile,
        areaId: general.areaId || null,
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
            kycType: kyc.kycType,
            aadhar: kyc.aadhar,
            pan: kyc.pan,
            voterId: kyc.voterId,
            issueDate: kyc.issueDate ? new Date(kyc.issueDate) : null
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
    const { general, coApplicant, kyc, bank, others } = req.body;

    const customer = await prisma.customer.update({
      where: { id: String(id) },
      data: {
        name: general.name,
        dob: general.dob ? new Date(general.dob) : null,
        placeOfBirth: general.placeOfBirth,
        maritalStatus: general.maritalStatus,
        address: general.address,
        residenceType: general.residenceType,
        occupation: general.occupation,
        phone: general.phone,
        mobile: general.mobile,
        areaId: general.areaId || null,
        groupId: general.groupId || null,
        employeeId: general.employeeId || null,

        familyMembers: others?.familyMembers ? Number(others.familyMembers) : 0,
        fatherName: others?.fatherName,
        motherName: others?.motherName,
        fatherDob: others?.fatherDob ? new Date(others.fatherDob) : null,
        motherDob: others?.motherDob ? new Date(others.motherDob) : null,

        coApplicant: coApplicant ? {
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
        } : undefined,

        kyc: kyc ? {
          upsert: {
            create: {
              kycType: kyc.kycType,
              aadhar: kyc.aadhar,
              pan: kyc.pan,
              voterId: kyc.voterId,
              issueDate: kyc.issueDate ? new Date(kyc.issueDate) : null
            },
            update: {
              kycType: kyc.kycType,
              aadhar: kyc.aadhar,
              pan: kyc.pan,
              voterId: kyc.voterId,
              issueDate: kyc.issueDate ? new Date(kyc.issueDate) : null
            }
          }
        } : undefined,

        bank: bank ? {
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

    res.json(customer);
  } catch (error) {
    console.error('Update Customer Error:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
};

export const getCustomers = async (req: Request, res: Response) => {
  try {
    const { search, areaId } = req.query;

    const where: any = {};
    
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { mobile: { contains: String(search), mode: 'insensitive' } },
        { customerNo: { contains: String(search), mode: 'insensitive' } }
      ];
    }
    
    // Support area scoping based on AuthMiddleware (from res.locals.areaIds)
    if (res.locals.areaIds && res.locals.areaIds.length > 0) {
      where.areaId = { in: res.locals.areaIds };
    } else if (areaId) {
      where.areaId = String(areaId);
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
