import { Request, Response } from 'express';
import prisma from '../../utils/prisma';
import { getNextTrnNumber, processLoanCollection } from '../../utils/collection.utils';
import { isAdminUser } from '../../utils/user.utils';

export const processBulkCollection = async (req: Request, res: Response): Promise<any> => {
  try {
    const { centerId, collections, staffId, trnDate } = req.body;

    if (!collections || !Array.isArray(collections) || collections.length === 0) {
      return res.status(400).json({ error: 'No collection data provided' });
    }

    const user = (req as any).user;
    const collectionDate = new Date(trnDate);

    const { processed, skipped } = await prisma.$transaction(async (tx) => {
      const processedCollections: any[] = [];
      const skippedEntries: { loanId: string; reason: string }[] = [];
      let trnCounter = await getNextTrnNumber(tx);
      let trnNum = parseInt(trnCounter.replace('TRN', ''), 10);

      for (const entry of collections) {
        const { loanId, amount, remarks } = entry;
        const entryAmount = Number(amount);
        if (entryAmount <= 0) continue;

        const trnNumber = `TRN${trnNum.toString().padStart(6, '0')}`;
        trnNum++;

        try {
          const result = await processLoanCollection(tx, {
            loanId,
            amount: entryAmount,
            trnDate: collectionDate,
            trnNumber,
            staffId: staffId || user?.id,
            remarks,
            centerId,
            userBranchId: user?.branchId,
            isAdmin: isAdminUser(user),
          });

          if (result.skipped) {
            skippedEntries.push({ loanId, reason: result.skipReason || 'Skipped' });
            trnNum--;
            continue;
          }

          const collection = await tx.collection.findUnique({ where: { id: result.collection.id } });
          if (collection) processedCollections.push(collection);
        } catch (err: any) {
          skippedEntries.push({ loanId, reason: err.message || 'Failed' });
          trnNum--;
        }
      }

      return { processed: processedCollections, skipped: skippedEntries };
    }, { timeout: 30000 });

    res.status(201).json({
      message: `Successfully processed ${processed.length} collections.`,
      processed: processed.length,
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
