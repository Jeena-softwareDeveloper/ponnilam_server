import { Request, Response } from 'express';
import prisma from '../../utils/prisma';

export const getLoanPackages = async (req: Request, res: Response): Promise<any> => {
  try {
    const packages = await prisma.loanPackage.findMany({ orderBy: { name: 'asc' } });
    return res.status(200).json(packages);
  } catch (error) {
    console.error('Error fetching loan packages:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createLoanPackage = async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, interestRate, durationDays, frequency } = req.body;
    if (!name || interestRate === undefined || !durationDays) {
      return res.status(400).json({ error: 'Name, interestRate, and durationDays are required' });
    }
    const pkg = await prisma.loanPackage.create({
      data: {
        name,
        interestRate: parseFloat(interestRate),
        durationDays: parseInt(durationDays),
        frequency: frequency || 'WEEKLY',
      },
    });
    return res.status(201).json(pkg);
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Package name already exists' });
    console.error('Error creating loan package:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateLoanPackage = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id);
    const { name, interestRate, durationDays, frequency, isActive } = req.body;
    const pkg = await prisma.loanPackage.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(interestRate !== undefined && { interestRate: parseFloat(interestRate) }),
        ...(durationDays !== undefined && { durationDays: parseInt(durationDays) }),
        ...(frequency !== undefined && { frequency }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    return res.status(200).json(pkg);
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Loan package not found' });
    console.error('Error updating loan package:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
export const deleteLoanPackage = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id);
    await prisma.loanPackage.delete({ where: { id } });
    return res.status(200).json({ message: 'Loan package deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Loan package not found' });
    if (error.code === 'P2003') return res.status(400).json({ error: 'Cannot delete loan package because it has active loans' });
    console.error('Error deleting loan package:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
