import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getStates = async (req: Request, res: Response): Promise<any> => {
  try {
    const states = await prisma.state.findMany({
      orderBy: { name: 'asc' },
    });
    return res.status(200).json(states);
  } catch (error) {
    console.error('Error fetching states:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createState = async (req: Request, res: Response): Promise<any> => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const state = await prisma.state.create({
      data: { name },
    });
    return res.status(201).json(state);
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'State name already exists' });
    console.error('Error creating state:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateState = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id);
    const { name, isActive } = req.body;
    const state = await prisma.state.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    return res.status(200).json(state);
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'State not found' });
    console.error('Error updating state:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteState = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id);
    await prisma.state.delete({ where: { id } });
    return res.status(200).json({ message: 'State deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting state:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
