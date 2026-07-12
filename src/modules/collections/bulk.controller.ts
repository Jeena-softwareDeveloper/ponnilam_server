import { Request, Response } from 'express';
import prisma from '../../utils/prisma';
import { processLoanCollection } from '../../utils/collection.utils';
import { isAdminUser } from '../../utils/user.utils';
import { assertMenuPermission, checkAreaScope, resolveStaffId } from '../../utils/validation.helpers';
import { requireBranchAccess } from '../../utils/security.utils';

export const processBulkCollection = async (req: Request, res: Response): Promise<any> => {
  try {
    const { centerId, collections, staffId, trnDate } = req.body;

    if (!collections || !Array.isArray(collections) || collections.length === 0) {
      return res.status(400).json({ error: 'No collection data provided' });
    }
    if (!trnDate || isNaN(new Date(trnDate).getTime())) {
      return res.status(400).json({ error: 'Valid transaction date is required' });
    }
    if (!centerId) {
      return res.status(400).json({ error: 'Center is required for bulk collection' });
    }

    const user = (req as any).user;
    const createPerm = await assertMenuPermission(user, '/admin/collections', 'canCreate');
    if (createPerm) return res.status(403).json({ error: createPerm });

    const center = await prisma.center.findUnique({
      where: { id: String(centerId) },
      include: { area: true },
    });
    if (!center) return res.status(400).json({ error: 'Invalid center selected' });
    if (!center.isActive) return res.status(400).json({ error: 'Selected center is inactive' });
    requireBranchAccess(user, center.area?.branchId, 'create collections outside your branch');
    const areaScopeErr = checkAreaScope(user, res.locals.areaIds, center.areaId);
    if (areaScopeErr) return res.status(403).json({ error: areaScopeErr });

    const staffResult = await resolveStaffId(staffId, user);
    if ('error' in staffResult) return res.status(400).json({ error: staffResult.error });
    const resolvedStaffId = staffResult.staffId;

    const collectionDate = new Date(trnDate);

    const { processed, skipped } = await prisma.$transaction(async (tx) => {
      const processedCollections: any[] = [];
      const skippedEntries: { loanId: string; reason: string }[] = [];

      for (const entry of collections) {
        const { loanId, amount, remarks } = entry;
        const entryAmount = Number(amount);
        if (entryAmount <= 0) continue;

        try {
          const result = await processLoanCollection(tx, {
            loanId,
            amount: entryAmount,
            trnDate: collectionDate,
            staffId: resolvedStaffId,
            remarks,
            centerId: String(centerId),
            userBranchId: user?.branchId,
            isAdmin: isAdminUser(user),
          });

          if (result.skipped) {
            skippedEntries.push({ loanId, reason: result.skipReason || 'Skipped' });
            continue;
          }

          const collection = await tx.collection.findUnique({ where: { id: result.collection.id } });
          if (collection) processedCollections.push(collection);
        } catch (err: any) {
          const reason =
            err.code === 'P2002'
              ? 'Transaction number conflict — please retry'
              : err.message || 'Failed';
          skippedEntries.push({ loanId, reason });
        }
      }

      return { processed: processedCollections, skipped: skippedEntries };
    }, { timeout: 30000 });

    res.status(201).json({
      message: `Processed ${processed.length} collection(s)${skipped.length ? `, ${skipped.length} skipped` : ''}.`,
      processed: processed.length,
      skippedCount: skipped.length,
      collections: processed,
      skipped,
    });
  } catch (error: any) {
    console.error('Bulk Collection Error:', error);
    if (error.code === 'P2002' && error.meta?.target?.includes('trnNumber')) {
      return res.status(409).json({ error: 'Transaction number conflict. Please try again.' });
    }
    res.status(500).json({ error: error.message || 'Failed to process bulk collections' });
  }
};
