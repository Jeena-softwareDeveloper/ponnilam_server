import { Request, Response } from 'express';
import prisma from '../../utils/prisma';
import { processLoanCollection } from '../../utils/collection.utils';
import { isAdminUser } from '../../utils/user.utils';
import { assertMenuPermission, checkAreaScope, resolveStaffId } from '../../utils/validation.helpers';
import { requireBranchAccess } from '../../utils/security.utils';
import { toCollectionDay } from '../../utils/date.utils';

/**
 * Mobile App Field Staff Collection Submission:
 * Submits collections to the Waiting List (PENDING status).
 * Collections remain unconfirmed until Cashier/Branch Manager physically
 * verifies cash in hand and confirms the batch in ERP.
 */
export const submitStaffEntries = async (req: Request, res: Response): Promise<any> => {
  try {
    const { centerId, collections, staffId, trnDate } = req.body;
    const user = (req as any).user;

    if (!collections || !Array.isArray(collections) || collections.length === 0) {
      return res.status(400).json({ error: 'No collection data provided' });
    }
    if (!trnDate || isNaN(new Date(trnDate).getTime())) {
      return res.status(400).json({ error: 'Valid transaction date is required' });
    }
    if (!centerId) {
      return res.status(400).json({ error: 'Center is required' });
    }

    const center = await prisma.center.findUnique({
      where: { id: String(centerId) },
      include: { area: { include: { branch: true } } },
    });
    if (!center) {
      return res.status(400).json({ error: 'Invalid center selected' });
    }
    if (!center.isActive) {
      return res.status(400).json({ error: 'Selected center is inactive' });
    }

    const branchId = center.area?.branchId;
    if (!branchId) {
      return res.status(400).json({ error: 'Center is not assigned to a valid branch' });
    }

    // Resolve submitting staff
    const staffResult = await resolveStaffId(staffId, user);
    if ('error' in staffResult) return res.status(400).json({ error: staffResult.error });
    const resolvedStaffId = staffResult.staffId;

    const collectionDate = new Date(trnDate);
    const batchId = `BATCH-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Filter valid positive amount entries
    const validEntries = collections.filter((e: any) => Number(e.amount) > 0);
    if (validEntries.length === 0) {
      return res.status(400).json({ error: 'At least one valid collection amount is required' });
    }

    // Load loans for these entries
    const loanIds = validEntries.map((e: any) => String(e.loanId));
    const loans = await prisma.loan.findMany({
      where: { id: { in: loanIds } },
      select: { id: true, customerId: true, loanNumber: true },
    });
    const loanMap = new Map(loans.map((l) => [l.id, l]));

    // Transaction to insert pending staff entries into Waiting List
    const { createdEntries, totalAmount } = await prisma.$transaction(async (tx) => {
      let sum = 0;
      const created = [];

      for (const item of validEntries) {
        const loan = loanMap.get(String(item.loanId));
        if (!loan) continue;

        const entryAmount = Number(item.amount);
        sum += entryAmount;

        // Prevent duplicate submissions if loan already has a non-voided collection today
        const targetDay = toCollectionDay(collectionDate);
        const alreadyCollected = await tx.collection.findFirst({
          where: {
            loanId: loan.id,
            collectionDay: targetDay,
            isVoided: false,
          },
        });
        if (alreadyCollected) {
          continue;
        }

        const existingPending = await tx.staffEntry.findFirst({
          where: {
            loanId: loan.id,
            status: 'PENDING',
          },
        });

        if (existingPending) {
          const updated = await tx.staffEntry.update({
            where: { id: existingPending.id },
            data: {
              batchId,
              trnDate: collectionDate,
              amount: entryAmount,
              remarks: item.remarks || `Mobile Field Collection - ${center.name}`,
              staffId: resolvedStaffId,
            },
          });
          created.push(updated);
        } else {
          const entry = await tx.staffEntry.create({
            data: {
              batchId,
              trnDate: collectionDate,
              amount: entryAmount,
              remarks: item.remarks || `Mobile Field Collection - ${center.name}`,
              status: 'PENDING',
              loanId: loan.id,
              customerId: loan.customerId,
              centerId: center.id,
              branchId,
              staffId: resolvedStaffId,
            },
          });
          created.push(entry);
        }
      }

      return { createdEntries: created, totalAmount: sum };
    });

    res.status(201).json({
      message: `Submitted ${createdEntries.length} collection(s) to Waiting List. Total: ₹${totalAmount.toLocaleString('en-IN')}. Awaiting branch cash confirmation.`,
      batchId,
      count: createdEntries.length,
      totalAmount,
      status: 'PENDING',
    });
  } catch (error: any) {
    console.error('Submit Staff Entries Error:', error);
    res.status(500).json({ error: error.message || 'Failed to submit staff collection entries' });
  }
};

/**
 * Summary for ERP Confirmation Header Filters:
 * Returns branches, staffs, and centers with pending counts & sums.
 */
export const getStaffEntriesSummary = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as any).user;
    const { branchId, status = 'PENDING' } = req.query;

    const isAdmin = isAdminUser(user);
    const filterBranchId = isAdmin
      ? branchId ? String(branchId) : undefined
      : user?.branchId;

    const where: any = {
      status: String(status),
    };
    if (filterBranchId) {
      where.branchId = filterBranchId;
    }

    // Get all pending entries with related metadata
    const entries = await prisma.staffEntry.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        staff: { select: { id: true, name: true, staffNo: true, username: true } },
        center: { select: { id: true, name: true, code: true, repaymentType: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Aggregate by Branch
    const branchMap = new Map<string, any>();
    // Aggregate by Staff
    const staffMap = new Map<string, any>();
    // Aggregate by Center
    const centerMap = new Map<string, any>();

    let totalPendingAmount = 0;

    for (const e of entries) {
      totalPendingAmount += e.amount;

      // Branch Aggregation
      if (e.branch) {
        if (!branchMap.has(e.branch.id)) {
          branchMap.set(e.branch.id, {
            id: e.branch.id,
            name: e.branch.name,
            code: e.branch.code,
            count: 0,
            amount: 0,
            centersCount: 0,
          });
        }
        const b = branchMap.get(e.branch.id);
        b.count += 1;
        b.amount += e.amount;
      }

      // Staff Aggregation
      if (e.staff) {
        if (!staffMap.has(e.staff.id)) {
          staffMap.set(e.staff.id, {
            id: e.staff.id,
            name: e.staff.name,
            staffNo: e.staff.staffNo,
            username: e.staff.username,
            branchId: e.branchId,
            count: 0,
            amount: 0,
            centers: new Set<string>(),
          });
        }
        const s = staffMap.get(e.staff.id);
        s.count += 1;
        s.amount += e.amount;
        s.centers.add(e.centerId);
      }

      // Center Aggregation
      if (e.center) {
        const key = `${e.staffId}_${e.center.id}`;
        if (!centerMap.has(key)) {
          centerMap.set(key, {
            id: e.center.id,
            name: e.center.name,
            code: e.center.code,
            repaymentType: e.center.repaymentType,
            staffId: e.staffId,
            staffName: e.staff?.name || '',
            branchId: e.branchId,
            branchName: e.branch?.name || '',
            count: 0,
            amount: 0,
            latestDate: e.trnDate,
          });
        }
        const c = centerMap.get(key);
        c.count += 1;
        c.amount += e.amount;
      }
    }

    const branches = Array.from(branchMap.values());
    const staffs = Array.from(staffMap.values()).map((s) => ({
      ...s,
      centersCount: s.centers.size,
      centers: undefined,
    }));
    const centers = Array.from(centerMap.values());

    res.json({
      branches,
      staffs,
      centers,
      totalPendingCount: entries.length,
      totalPendingAmount,
    });
  } catch (error: any) {
    console.error('Staff Entries Summary Error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch staff entries summary' });
  }
};

/**
 * Detailed List of Staff Entries:
 * Filtered by branch, staff, center, status, date
 */
export const getStaffEntries = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as any).user;
    const { branchId, staffId, centerId, status = 'PENDING', date } = req.query;

    const isAdmin = isAdminUser(user);
    const filterBranchId = isAdmin
      ? branchId ? String(branchId) : undefined
      : user?.branchId;

    const where: any = {};

    if (status && status !== 'ALL') {
      where.status = String(status);
    }
    if (filterBranchId) {
      where.branchId = filterBranchId;
    }
    if (staffId && staffId !== 'ALL') {
      where.staffId = String(staffId);
    }
    if (centerId && centerId !== 'ALL') {
      where.centerId = String(centerId);
    }
    if (date) {
      const d = new Date(String(date));
      if (!isNaN(d.getTime())) {
        const startOfDay = new Date(d);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(d);
        endOfDay.setHours(23, 59, 59, 999);
        where.trnDate = { gte: startOfDay, lte: endOfDay };
      }
    }

    const entries = await prisma.staffEntry.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            customerNo: true,
            name: true,
            mobile: true,
          },
        },
        loan: {
          select: {
            id: true,
            loanNumber: true,
            amount: true,
            outstandingAmount: true,
            perDueAmount: true,
          },
        },
        center: {
          select: {
            id: true,
            name: true,
            code: true,
            repaymentType: true,
          },
        },
        staff: {
          select: {
            id: true,
            name: true,
            staffNo: true,
          },
        },
        confirmedBy: {
          select: {
            id: true,
            name: true,
            staffNo: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalAmount = entries.reduce((sum, e) => sum + e.amount, 0);

    res.json({
      entries,
      count: entries.length,
      totalAmount,
    });
  } catch (error: any) {
    console.error('Get Staff Entries Error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch staff collection entries' });
  }
};

/**
 * Confirm Staff Entries (Cash Handover Confirmation):
 * "panam kaiala vangiyachuna confirm nu oru confirm pana antha center ku against tha entry aaganum"
 * 
 * Verifies physical cash was received in hand by cashier/manager,
 * then processes official collection records, allocates against loan schedules,
 * updates balances, and marks the entries CONFIRMED.
 */
export const confirmStaffEntries = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as any).user;
    const { centerId, staffId, entryIds, trnDate, remarks } = req.body;

    const createPerm = await assertMenuPermission(user, '/admin/collections', 'canCreate');
    if (createPerm) return res.status(403).json({ error: createPerm });

    // Determine target pending entries
    const where: any = {
      status: 'PENDING',
    };

    if (entryIds && Array.isArray(entryIds) && entryIds.length > 0) {
      where.id = { in: entryIds.map(String) };
    } else if (centerId && staffId) {
      where.centerId = String(centerId);
      where.staffId = String(staffId);
    } else if (centerId) {
      where.centerId = String(centerId);
    } else {
      return res.status(400).json({ error: 'Center ID or specific Entry IDs are required for confirmation' });
    }

    const pendingEntries = await prisma.staffEntry.findMany({
      where,
      include: {
        center: { include: { area: true } },
        loan: true,
        staff: true,
      },
    });

    if (pendingEntries.length === 0) {
      return res.status(404).json({ error: 'No pending staff collection entries found for confirmation' });
    }

    // Branch security check
    const firstBranchId = pendingEntries[0]?.branchId;
    requireBranchAccess(user, firstBranchId, 'confirm collections outside your branch');

    const confirmedDate = trnDate && !isNaN(new Date(trnDate).getTime())
      ? new Date(trnDate)
      : new Date();

    const result = await prisma.$transaction(async (tx) => {
      const confirmedList: any[] = [];
      const skippedList: any[] = [];
      let confirmedTotal = 0;

      for (const entry of pendingEntries) {
        try {
          // Process official loan collection
          const colResult = await processLoanCollection(tx, {
            loanId: entry.loanId,
            amount: entry.amount,
            trnDate: entry.trnDate || confirmedDate,
            staffId: entry.staffId,
            remarks: remarks || entry.remarks || `Confirmed by ${user.name}`,
            centerId: entry.centerId,
            userBranchId: user?.branchId,
            isAdmin: isAdminUser(user),
          });

          if (colResult.skipped) {
            // If skipped because collection was already created for this loan on this date:
            if (
              colResult.skipReason === 'Duplicate collection for this loan on the same date' &&
              colResult.collection?.id
            ) {
              const updated = await tx.staffEntry.update({
                where: { id: entry.id },
                data: {
                  status: 'CONFIRMED',
                  confirmedById: user.id,
                  confirmedAt: new Date(),
                  collectionId: colResult.collection.id,
                },
              });
              confirmedTotal += entry.amount;
              confirmedList.push(updated);
              continue;
            }

            skippedList.push({ id: entry.id, reason: colResult.skipReason });
            continue;
          }

          // Mark StaffEntry as CONFIRMED with link to collection
          const updated = await tx.staffEntry.update({
            where: { id: entry.id },
            data: {
              status: 'CONFIRMED',
              confirmedById: user.id,
              confirmedAt: new Date(),
              collectionId: colResult.collection?.id || null,
            },
          });

          confirmedTotal += entry.amount;
          confirmedList.push(updated);
        } catch (err: any) {
          console.error(`Failed to confirm entry ${entry.id}:`, err);
          skippedList.push({ id: entry.id, reason: err.message || 'Processing failed' });
        }
      }

      return {
        confirmedCount: confirmedList.length,
        confirmedTotal,
        skippedCount: skippedList.length,
        skipped: skippedList,
      };
    }, { timeout: 45000 });

    res.status(200).json({
      message: `Confirmed ${result.confirmedCount} collection(s) totaling ₹${result.confirmedTotal.toLocaleString('en-IN')}.${result.skippedCount > 0 ? ` (${result.skippedCount} skipped)` : ''}`,
      ...result,
    });
  } catch (error: any) {
    console.error('Confirm Staff Entries Error:', error);
    res.status(500).json({ error: error.message || 'Failed to confirm staff collection entries' });
  }
};

/**
 * Reject Staff Entries:
 * If cash does not match or staff made an incorrect entry,
 * cashier/manager can reject the entry with a reason.
 */
export const rejectStaffEntries = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as any).user;
    const { centerId, staffId, entryIds, reason } = req.body;

    const where: any = {
      status: 'PENDING',
    };

    if (entryIds && Array.isArray(entryIds) && entryIds.length > 0) {
      where.id = { in: entryIds.map(String) };
    } else if (centerId && staffId) {
      where.centerId = String(centerId);
      where.staffId = String(staffId);
    } else {
      return res.status(400).json({ error: 'Center ID or specific Entry IDs required' });
    }

    const updated = await prisma.staffEntry.updateMany({
      where,
      data: {
        status: 'REJECTED',
        rejectionReason: reason || 'Rejected by cashier/manager during cash handover',
        confirmedById: user.id,
        confirmedAt: new Date(),
      },
    });

    res.json({
      message: `Rejected ${updated.count} pending collection entries.`,
      rejectedCount: updated.count,
    });
  } catch (error: any) {
    console.error('Reject Staff Entries Error:', error);
    res.status(500).json({ error: error.message || 'Failed to reject staff collection entries' });
  }
};
