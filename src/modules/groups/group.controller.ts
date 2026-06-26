import { Request, Response } from 'express';
import prisma from '../../utils/prisma';
import { requireBranchAccess } from '../../utils/security.utils';
import { denyUnlessMenuPermission } from '../../utils/master-permissions';
import { assertMenuPermission } from '../../utils/validation.helpers';

const MENU_PATH = '/admin/masters/groups';

async function validateCenterAccess(req: Request, res: Response, centerId: string, action: string) {
  const center = await prisma.center.findUnique({
    where: { id: centerId },
    include: { area: true },
  });
  if (!center) {
    const err: any = new Error('Invalid center');
    err.status = 400;
    throw err;
  }
  const user = (req as any).user;
  requireBranchAccess(user, center.area?.branchId, action);
  if (res.locals.areaIds?.length && center.areaId && !res.locals.areaIds.includes(center.areaId)) {
    const err: any = new Error('Security Violation: center is outside your area.');
    err.status = 403;
    throw err;
  }
  return center;
}

function handleError(res: Response, error: any) {
  if (error.status) return res.status(error.status).json({ error: error.message });
  if (error.message?.includes('Security Violation')) return res.status(403).json({ error: error.message });
  console.error('Group error:', error);
  return res.status(500).json({ error: 'Internal server error' });
}

export const getGroups = async (req: Request, res: Response): Promise<any> => {
  try {
    const { centerId, branchId } = req.query;
    const whereClause: any = {};

    if (centerId) {
      whereClause.centerId = String(centerId);
    } else if (branchId && branchId !== 'all') {
      whereClause.center = { area: { branchId: String(branchId) } };
    }

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
    return handleError(res, error);
  }
};

export const createGroup = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as any).user;
    const groupsPermErr = await assertMenuPermission(user, MENU_PATH, 'canCreate');
    const customersCreateErr = await assertMenuPermission(user, '/admin/customers', 'canCreate');
    const customersEditErr = await assertMenuPermission(user, '/admin/customers', 'canEdit');
    if (groupsPermErr && customersCreateErr && customersEditErr) {
      return res.status(403).json({ error: groupsPermErr });
    }

    const { groupName, groupCode, meetingDay, centerId } = req.body;
    if (!groupName || !centerId) return res.status(400).json({ error: 'Group Name and Center are required' });

    await validateCenterAccess(req, res, centerId, 'create a group in a center outside your branch');

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
    return handleError(res, error);
  }
};

export const updateGroup = async (req: Request, res: Response): Promise<any> => {
  try {
    if (await denyUnlessMenuPermission(req, res, MENU_PATH, 'canEdit')) return;

    const id = String(req.params.id);
    const existing = await prisma.group.findUnique({ where: { id }, include: { center: { include: { area: true } } } });
    if (!existing) return res.status(404).json({ error: 'Group not found' });

    requireBranchAccess((req as any).user, existing.center?.area?.branchId, 'update a group outside your branch');

    const { groupName, groupCode, meetingDay, centerId, isActive } = req.body;
    if (centerId && centerId !== existing.centerId) {
      await validateCenterAccess(req, res, centerId, 'move a group to a center outside your branch');
    }

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
    return handleError(res, error);
  }
};

export const deleteGroup = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as any).user;
    const groupsPermErr = await assertMenuPermission(user, MENU_PATH, 'canDelete');
    const customersPermErr = await assertMenuPermission(user, '/admin/customers', 'canEdit');
    if (groupsPermErr && customersPermErr) {
      return res.status(403).json({ error: groupsPermErr });
    }

    const id = String(req.params.id);
    const existing = await prisma.group.findUnique({ where: { id }, include: { center: { include: { area: true } } } });
    if (!existing) return res.status(404).json({ error: 'Group not found' });

    requireBranchAccess((req as any).user, existing.center?.area?.branchId, 'delete a group outside your branch');

    const assignedCount = await prisma.customer.count({ where: { groupId: id } });
    if (assignedCount > 0) {
      return res.status(400).json({
        error: `Cannot delete this group — ${assignedCount} customer(s) are still assigned to it.`,
      });
    }

    const centerGroupCount = await prisma.group.count({ where: { centerId: existing.centerId } });
    if (centerGroupCount <= 1) {
      return res.status(400).json({ error: 'Each center must keep at least one group.' });
    }

    await prisma.group.delete({ where: { id } });
    return res.status(200).json({ message: 'Group deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Group not found' });
  if (error.code === 'P2003') return res.status(400).json({ error: 'Cannot delete group with associated customers' });
    return handleError(res, error);
  }
};
