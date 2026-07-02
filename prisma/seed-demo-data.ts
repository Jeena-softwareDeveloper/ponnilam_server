// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { assignBranchManagerMenus } from '../src/utils/branch-menus.utils';
import {
  buildScheduleRows,
  computeFlatEmi,
  resolveLastEmiAmount,
} from '../src/utils/loan.utils';
import { LoanStatus } from '../src/utils/prisma-enums';
import { nextCustomerNo } from '../src/utils/sequence.utils';

/** Max members per group — when exceeded, center splits into Group B, then Group C */
const PER_GROUP_LIMIT = 3;

const GROUP_DEFS = [
  { groupName: 'Group A', groupCode: 'GA' },
  { groupName: 'Group B', groupCode: 'GB' },
  { groupName: 'Group C', groupCode: 'GC' },
] as const;

type CustomerDef = { name: string; mobile: string; altPhone?: string };

type StaffBundle = {
  name: string;
  username: string;
  phone: string;
  branchCode: string;
  areaName: string;
  centers: { name: string; code: string; customers: CustomerDef[] }[];
};

/** 3 branches · 4 collection staff · 5 centers */
const BRANCH_DEFS = [
  {
    code: 'SAT',
    name: 'Sathyamangalam',
    location: '13/04, VSB Nest, Sri Venugopalasamy Temple Street, Sathyamangalam - 638 401',
    phone: '9944533403',
  },
  {
    code: 'ANT',
    name: 'Anthiur',
    location: 'Anthiur Main Road, Erode District - 638 501',
    phone: '9944533410',
  },
  {
    code: 'BHA',
    name: 'Bhavani',
    location: 'Mettur Road, Bhavani, Erode District - 638 301',
    phone: '9944533420',
  },
];

const DEMO_STAFF: StaffBundle[] = [
  {
    name: 'Harishkumar J',
    username: 'harish',
    phone: '9944533403',
    branchCode: 'SAT',
    areaName: 'Rajiv Gandhi Nagar',
    centers: [
      {
        name: 'ESWARI RAJIV GANDHI NAGAR',
        code: 'SAT51',
        customers: [
          { name: 'Eswari S', mobile: '9500683255', altPhone: '9677201197' },
          { name: 'Malarkodi C', mobile: '9500683256' },
          { name: 'Kavitha R', mobile: '9500683257' },
          { name: 'Sumathi P', mobile: '9500683258' },
          { name: 'Latha M', mobile: '9500683259' },
          { name: 'Meena K', mobile: '9500683260' },
          { name: 'Padma N', mobile: '9500683265' },
          { name: 'Revathi S', mobile: '9500683266' },
          { name: 'Suganthi V', mobile: '9500683267' },
        ],
      },
      {
        name: 'BHUVANESWARI KASIPALAYAM',
        code: 'SAT52',
        customers: [
          { name: 'Bhuvaneswari V', mobile: '9500683261' },
          { name: 'Deepa S', mobile: '9500683262' },
          { name: 'Gomathi R', mobile: '9500683263' },
          { name: 'Hema L', mobile: '9500683264' },
        ],
      },
    ],
  },
  {
    name: 'Jayanthi M',
    username: 'jayanthi',
    phone: '9944533404',
    branchCode: 'SAT',
    areaName: 'Ayeepalayam',
    centers: [
      {
        name: 'JAYANTHI AYEEPALAYAM',
        code: 'SAT30',
        customers: [
          { name: 'Jayanthi P', mobile: '9500683271' },
          { name: 'Anitha S', mobile: '9500683272' },
          { name: 'Valli K', mobile: '9500683273' },
          { name: 'Rani D', mobile: '9500683274' },
          { name: 'Shanthi M', mobile: '9500683275' },
        ],
      },
    ],
  },
  {
    name: 'Priya R',
    username: 'priya',
    phone: '9944533406',
    branchCode: 'ANT',
    areaName: 'Anthiur Main',
    centers: [
      {
        name: 'PRIYA ANTHIUR MAIN',
        code: 'ANT01',
        customers: [
          { name: 'Jeena S', mobile: '9500683291', altPhone: '9500683292' },
          { name: 'Roja P', mobile: '9500683293' },
          { name: 'Nithya K', mobile: '9500683294' },
          { name: 'Divya M', mobile: '9500683295' },
        ],
      },
    ],
  },
  {
    name: 'Murugan K',
    username: 'murugan',
    phone: '9944533407',
    branchCode: 'BHA',
    areaName: 'Bhavani Town',
    centers: [
      {
        name: 'MURUGAN BHAVANI TOWN',
        code: 'BHA01',
        customers: [
          { name: 'Murugan A', mobile: '9500683301' },
          { name: 'Lakshmi V', mobile: '9500683302' },
          { name: 'Saranya R', mobile: '9500683303' },
          { name: 'Karthik S', mobile: '9500683304' },
          { name: 'Vignesh T', mobile: '9500683305' },
        ],
      },
    ],
  },
];

async function ensureGeography(prisma: PrismaClient) {
  const state = await prisma.state.upsert({
    where: { name: 'Tamil Nadu' },
    update: { isActive: true },
    create: { name: 'Tamil Nadu', isActive: true },
  });

  const district = await prisma.district.upsert({
    where: { name_stateId: { name: 'Erode', stateId: state.id } },
    update: { isActive: true },
    create: { name: 'Erode', stateId: state.id, isActive: true },
  });

  const branches: Record<string, { id: string; code: string }> = {};
  for (const def of BRANCH_DEFS) {
    const branch = await prisma.branch.upsert({
      where: { code: def.code },
      update: {
        name: def.name,
        location: def.location,
        phone: def.phone,
        isActive: true,
      },
      create: {
        code: def.code,
        name: def.name,
        location: def.location,
        phone: def.phone,
        isActive: true,
        stateId: state.id,
        districtId: district.id,
      },
    });
    branches[def.code] = { id: branch.id, code: def.code };
    await prisma.$transaction(async (tx) => {
      await assignBranchManagerMenus(tx, branch.id);
    });
  }

  return { state, district, branches };
}

async function ensureLoanPackage(prisma: PrismaClient) {
  return prisma.loanPackage.upsert({
    where: { name: 'Weekly Micro Loan 30%' },
    update: { isActive: true, interestRate: 30, durationDays: 140, frequency: 'WEEKLY' },
    create: {
      name: 'Weekly Micro Loan 30%',
      interestRate: 30,
      durationDays: 140,
      frequency: 'WEEKLY',
      isActive: true,
    },
  });
}

async function ensureStaff(
  prisma: PrismaClient,
  bundle: StaffBundle,
  staffRoleId: string,
  staffPasswordHash: string,
  branchId: string,
  areaId: string
) {
  const staff = await prisma.staff.upsert({
    where: { phone: bundle.phone },
    update: {
      name: bundle.name,
      username: bundle.username,
      branchId,
      areaId,
      roleId: staffRoleId,
      isActive: true,
      mustChangePassword: false,
      password: staffPasswordHash,
    },
    create: {
      name: bundle.name,
      username: bundle.username,
      phone: bundle.phone,
      password: staffPasswordHash,
      branchId,
      areaId,
      roleId: staffRoleId,
      isActive: true,
      mustChangePassword: false,
    },
  });

  await prisma.$transaction(async (tx) => {
    await assignBranchManagerMenus(tx, branchId, staff.id);
  });

  return staff;
}

async function ensureArea(prisma: PrismaClient, branchId: string, areaName: string) {
  const existing = await prisma.area.findFirst({
    where: { branchId, name: areaName },
  });
  if (existing) return existing;
  return prisma.area.create({
    data: { name: areaName, branchId, isActive: true },
  });
}

async function ensureCenter(
  prisma: PrismaClient,
  areaId: string,
  employeeId: string,
  centerDef: { name: string; code: string },
  _memberCount: number
) {
  const center = await prisma.center.upsert({
    where: { code: centerDef.code },
    update: {
      name: centerDef.name,
      areaId,
      employeeId,
      totalMembers: PER_GROUP_LIMIT,
      isActive: true,
      repaymentType: 'WEEKLY',
      disbursMode: 'CASH',
    },
    create: {
      name: centerDef.name,
      code: centerDef.code,
      areaId,
      employeeId,
      totalMembers: PER_GROUP_LIMIT,
      isActive: true,
      repaymentType: 'WEEKLY',
      disbursMode: 'CASH',
    },
  });
  return center;
}

function groupsNeededForCount(customerCount: number) {
  if (customerCount <= PER_GROUP_LIMIT) return 1;
  if (customerCount <= PER_GROUP_LIMIT * 2) return 2;
  return 3;
}

async function ensureCenterGroups(
  prisma: PrismaClient,
  centerId: string,
  centerCode: string,
  customerCount: number
) {
  const needed = groupsNeededForCount(customerCount);
  const groups: { id: string; groupName: string }[] = [];

  for (let i = 0; i < needed; i++) {
    const def = GROUP_DEFS[i];
    const groupCode = `${centerCode}-${def.groupCode}`;
    const group = await prisma.group.upsert({
      where: {
        centerId_groupName: { centerId, groupName: def.groupName },
      },
      update: {
        groupCode,
        isActive: true,
      },
      create: {
        centerId,
        groupName: def.groupName,
        groupCode,
        isActive: true,
      },
    });
    groups.push(group);
  }

  return groups;
}

function groupIdForCustomerIndex(groups: { id: string }[], customerIndex: number) {
  const slot = Math.floor(customerIndex / PER_GROUP_LIMIT);
  return groups[Math.min(slot, groups.length - 1)]?.id || null;
}

async function ensureCustomerWithLoan(
  prisma: PrismaClient,
  opts: {
    branchId: string;
    areaId: string;
    centerId: string;
    centerCode: string;
    staffId: string;
    packageId: string;
    customer: CustomerDef;
    loanSerial: number;
    groupId: string | null;
  }
) {
  let customer = await prisma.customer.findFirst({
    where: { centerId: opts.centerId, name: opts.customer.name },
  });

  if (!customer) {
    customer = await prisma.$transaction(async (tx) => {
      const customerNo = await nextCustomerNo(tx, opts.centerId, opts.branchId);
      return tx.customer.create({
        data: {
          customerNo,
          name: opts.customer.name,
          mobile: opts.customer.mobile,
          phone: opts.customer.altPhone || opts.customer.mobile,
          address: `${opts.customer.name}, Center Area`,
          maritalStatus: 'MARRIED',
          residenceType: 'OWNED',
          areaId: opts.areaId,
          centerId: opts.centerId,
          groupId: opts.groupId,
          employeeId: opts.staffId,
          centerMemberType: 'MEMBER',
          isActive: true,
        },
      });
    });
  } else {
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        areaId: opts.areaId,
        centerId: opts.centerId,
        groupId: opts.groupId,
        employeeId: opts.staffId,
        mobile: opts.customer.mobile,
        phone: opts.customer.altPhone || opts.customer.mobile,
      },
    });
  }

  const loanNumber = `${opts.centerCode}-L${String(opts.loanSerial).padStart(3, '0')}`;
  const existingLoan = await prisma.loan.findUnique({
    where: { loanNumber },
  });
  if (existingLoan) {
    await prisma.loan.update({
      where: { id: existingLoan.id },
      data: { staffId: opts.staffId, customerId: customer.id },
    });
    return;
  }

  const principal = 10000;
  const noOfDues = 20;
  const { perDueAmount, totalDueAmount } = computeFlatEmi(principal, 30, noOfDues);
  const firstDueDate = new Date();
  firstDueDate.setDate(firstDueDate.getDate() - 14);

  await prisma.$transaction(async (tx) => {
    const loan = await tx.loan.create({
      data: {
        loanNumber,
        customerId: customer.id,
        staffId: opts.staffId,
        packageId: opts.packageId,
        amount: principal,
        interestRate: 30,
        status: LoanStatus.ACTIVE,
        noOfDues,
        perDueAmount,
        totalDueAmount,
        outstandingAmount: totalDueAmount,
        deductionAmount: 0,
        netDisbursement: principal,
        salary: 15000,
        totalIncome: 15000,
        totalExpense: 7000,
        eligibleEmi: 2000,
        applicationDate: new Date(),
        sanctionDate: new Date(),
        disbursementDate: new Date(),
        firstDueDate,
      },
    });

    const lastEmi = resolveLastEmiAmount(totalDueAmount, perDueAmount, noOfDues);
    const schedules = buildScheduleRows(
      loan.id,
      noOfDues,
      perDueAmount,
      firstDueDate,
      'WEEKLY',
      lastEmi
    );
    await tx.loanSchedule.createMany({ data: schedules });
  });
}

export async function seedDemoData(
  prisma: PrismaClient,
  staffRoleId: string,
  staffPasswordPlain: string
) {
  const totalCenters = DEMO_STAFF.reduce((n, s) => n + s.centers.length, 0);
  console.log(
    `Seeding demo data — ${BRANCH_DEFS.length} branches, ${DEMO_STAFF.length} collection staff, ${totalCenters} centers...`
  );

  const staffPasswordHash = await bcrypt.hash(staffPasswordPlain, 10);
  const { branches } = await ensureGeography(prisma);
  const loanPackage = await ensureLoanPackage(prisma);

  for (const bundle of DEMO_STAFF) {
    const branch = branches[bundle.branchCode];
    if (!branch) continue;

    const area = await ensureArea(prisma, branch.id, bundle.areaName);
    const staff = await ensureStaff(
      prisma,
      bundle,
      staffRoleId,
      staffPasswordHash,
      branch.id,
      area.id
    );

    for (const centerDef of bundle.centers) {
      const center = await ensureCenter(
        prisma,
        area.id,
        staff.id,
        centerDef,
        centerDef.customers.length
      );

      const groups = await ensureCenterGroups(
        prisma,
        center.id,
        centerDef.code,
        centerDef.customers.length
      );

      for (const [index, customerDef] of centerDef.customers.entries()) {
        await ensureCustomerWithLoan(prisma, {
          branchId: branch.id,
          areaId: area.id,
          centerId: center.id,
          centerCode: centerDef.code,
          staffId: staff.id,
          packageId: loanPackage.id,
          customer: customerDef,
          loanSerial: index + 1,
          groupId: groupIdForCustomerIndex(groups, index),
        });
      }
    }

    console.log(
      `  ✓ ${bundle.name} (@${bundle.username}) — branch ${bundle.branchCode}, ` +
        `${bundle.centers.length} center(s), ` +
        `${bundle.centers.reduce((n, c) => n + c.customers.length, 0)} customers`
    );
  }

  console.log('');
  console.log('Demo summary:');
  console.log(`  Branches : ${BRANCH_DEFS.map((b) => b.name).join(', ')}`);
  console.log(`  Staff    : ${DEMO_STAFF.length} collection officers`);
  console.log(`  Centers  : ${totalCenters}`);
  console.log(`  Groups   : Group A / Group B (split) / Group C — ${PER_GROUP_LIMIT} members per group`);
  console.log('');
  console.log('Collection staff login (username / password):');
  for (const bundle of DEMO_STAFF) {
    console.log(`  ${bundle.username} / ${staffPasswordPlain}`);
  }
}
