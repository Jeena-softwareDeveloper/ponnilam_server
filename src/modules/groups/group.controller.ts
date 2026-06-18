import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getGroups = async (req: Request, res: Response): Promise<any> => {
  try {
    const { centerId, branchId } = req.query;
    const whereClause: any = {};
    
    if (centerId) {
      whereClause.centerId = String(centerId);
    } else if (branchId) {
      whereClause.center = { area: { branchId: String(branchId) } };
    }
    
    // Support area scoping based on AuthMiddleware
    if (res.locals.areaIds && res.locals.areaIds.length > 0) {
      whereClause.center = { ...whereClause.center, areaId: { in: res.locals.areaIds } };
    }

    const groups = await prisma.group.findMany({
      where: whereClause,
      include: { center: true, _count: { select: { customers: true } } },
      orderBy: { groupName: 'asc' },
    });
    return res.status(200).json(groups);
  } catch (error) {
    console.error('Error fetching groups:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createGroup = async (req: Request, res: Response): Promise<any> => {
  try {
    const { groupName, groupCode, meetingDay, centerId } = req.body;
    if (!groupName || !centerId) return res.status(400).json({ error: 'Group Name and Center are required' });
    const group = await prisma.group.create({
      data: {
        groupName,
        groupCode: groupCode || null,
        meetingDay: meetingDay || null,
        centerId,
      },
      include: { center: true },
    });
    return res.status(201).json(group);
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Group name already exists in this center' });
    console.error('Error creating group:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateGroup = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id);
    const { groupName, groupCode, meetingDay, centerId, isActive } = req.body;
    const group = await prisma.group.update({
      where: { id },
      data: {
        ...(groupName !== undefined && { groupName }),
        ...(groupCode !== undefined && { groupCode: groupCode || null }),
        ...(meetingDay !== undefined && { meetingDay: meetingDay || null }),
        ...(centerId !== undefined && { centerId }),
        ...(isActive !== undefined && { isActive }),
      },
      include: { center: true },
    });
    return res.status(200).json(group);
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Group not found' });
    console.error('Error updating group:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteGroup = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id);
    await prisma.group.delete({ where: { id } });
    return res.status(200).json({ message: 'Group deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Group not found' });
    if (error.code === 'P2003' || error.code === 'P2014' || (error.message && error.message.includes('foreign key constraint'))) {
      return res.status(400).json({ error: 'Cannot delete group because it has associated customers' });
    }
    console.error('Error deleting group:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
