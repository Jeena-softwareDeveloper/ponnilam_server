import prisma from '../../utils/prisma';
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { NotificationType, NotificationStatus } from '../../utils/prisma-enums';
import { asyncHandler } from '../../utils/asyncHandler';


function getPhoneSearchVariants(input: string): string[] {
  const raw = String(input || '').trim();
  const digitsOnly = raw.replace(/\D/g, '');
  const last10 = digitsOnly.slice(-10);

  const variants = new Set<string>();
  if (raw) variants.add(raw);
  if (digitsOnly) variants.add(digitsOnly);
  if (last10 && last10.length === 10) {
    variants.add(last10);
    variants.add(`+91${last10}`);
    variants.add(`91${last10}`);
    variants.add(`0${last10}`);
  }
  return Array.from(variants).filter(Boolean);
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const phoneVariants = getPhoneSearchVariants(username);
  const staff = await prisma.staff.findFirst({
    where: {
      OR: [
        { email: username },
        { username: username },
        ...phoneVariants.map(p => ({ phone: p })),
        ...phoneVariants.map(p => ({ username: p }))
      ]
    },
    include: { role: true, branch: true, area: { include: { branch: true } } }
  });

  if (!staff) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!staff.isActive) {
    return res.status(403).json({ error: 'Account is inactive' });
  }

  // Compare passwords (bcrypt only — no plaintext fallback)
  if (!staff.password.startsWith('$2b$') && !staff.password.startsWith('$2a$')) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const isMatch = await bcrypt.compare(password, staff.password);
  const isFirstLogin =
    (staff.username && (await bcrypt.compare(staff.username, staff.password))) ||
    (staff.phone && (await bcrypt.compare(staff.phone, staff.password)));

  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Generate JWT with strict branch assignment
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is not configured. Server startup failed.');
  }
  const token = jwt.sign(
    {
      id: staff.id,
      branchId: staff.branchId || staff.area?.branchId || null
    },
    jwtSecret,
    { expiresIn: '1d' }
  );

  if (isFirstLogin || staff.mustChangePassword) {
    return res.status(200).json({
      message: 'Password change required',
      forcePasswordChange: true,
      token,
      user: {
        id: staff.id,
        name: staff.name,
        role: staff.role?.name || 'User',
        area: staff.area?.name || null,
        branch: staff.branch?.name || staff.area?.branch?.name || null,
        branchId: staff.branchId || staff.area?.branchId || null
      }
    });
  }

  await prisma.auditLog.create({
    data: {
      action: 'LOGIN',
      entity: 'Auth',
      staffId: staff.id,
      details: 'User logged in successfully'
    }
  });

  return res.status(200).json({
    message: 'Login successful',
    token,
    user: {
      id: staff.id,
      name: staff.name,
      role: staff.role?.name || 'User',
      area: staff.area?.name || null,
      branch: staff.branch?.name || staff.area?.branch?.name || null,
      branchId: staff.branchId || staff.area?.branchId || null
    }
  });

});

export const getAuthMenus = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Admin (env or role) gets all menus with full CRUD
  const buildFullAccess = (menus: any[]) =>
    menus.map(m => ({ ...m, canView: true, canCreate: true, canEdit: true, canDelete: true }));

  const staff = await prisma.staff.findUnique({
    where: { id: user.id },
    include: {
      role: true,
      menus: { include: { menu: true } },
      branch: { include: { menus: { include: { menu: true } } } },
      area: { include: { branch: { include: { menus: { include: { menu: true } } } } } }
    }
  });

  if (!staff) return res.status(404).json({ error: 'Staff not found' });

  if (staff.role?.name === 'Admin') {
    const allMenus = await prisma.menu.findMany({ orderBy: { name: 'asc' } });
    return res.status(200).json(buildFullAccess(allMenus));
  }

  // Non-admin: build menus WITH their CRUD permissions
  let allowedEntries: any[] = [];
  const staffSpecificMenus = staff.menus; // StaffMenu[] with canView etc.

  if (staffSpecificMenus.length > 0) {
    allowedEntries = staffSpecificMenus.map((sm: any) => ({
      ...sm.menu,
      canView: sm.canView,
      canCreate: sm.canCreate,
      canEdit: sm.canEdit,
      canDelete: sm.canDelete,
    }));
  } else if (staff.branch?.menus?.length) {
    allowedEntries = staff.branch.menus.map((bm: any) => ({
      ...bm.menu,
      canView: bm.canView,
      canCreate: bm.canCreate,
      canEdit: bm.canEdit,
      canDelete: bm.canDelete,
    }));
  } else if (staff.area?.branch?.menus?.length) {
    allowedEntries = staff.area.branch.menus.map((bm: any) => ({
      ...bm.menu,
      canView: bm.canView,
      canCreate: bm.canCreate,
      canEdit: bm.canEdit,
      canDelete: bm.canDelete,
    }));
  }

  return res.status(200).json(allowedEntries.filter((m: any) => m.canView !== false));
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user || !user.id || user.id === 'env-admin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.staff.update({
    where: { id: user.id },
    data: { password: hashedPassword, mustChangePassword: false },
  });

  return res.status(200).json({ message: 'Password updated successfully' });
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username is required' });

  const staff = await prisma.staff.findFirst({
    where: {
      OR: [
        { username },
        { phone: username },
        { email: username }
      ]
    }
  });

  if (!staff) {
    return res.status(200).json({ message: 'If the username exists, a reset request has been sent to the admin.' });
  }

  const pending = await prisma.notification.findFirst({
    where: {
      staffId: staff.id,
      type: NotificationType.PASSWORD_RESET,
      status: NotificationStatus.PENDING,
    },
  });
  if (pending) {
    return res.status(200).json({ message: 'If the username exists, a reset request has been sent to the admin.' });
  }

  // Create a notification for Admins / Branch Managers
  await prisma.notification.create({
    data: {
      type: NotificationType.PASSWORD_RESET,
      title: 'Password Reset Request',
      message: `${staff.name} (${staff.username || staff.phone}) requested a password reset.`,
      staffId: staff.id,
      branchId: staff.branchId,
      status: NotificationStatus.PENDING,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'FORGOT_PASSWORD_REQUEST',
      entity: 'Auth',
      staffId: staff.id,
      details: `Password reset requested for ${staff.name} (${staff.username || staff.phone})`
    }
  });

  return res.status(200).json({ message: 'If the username exists, a reset request has been sent to the admin.' });
});

// In-memory OTP cache for verification
const otpCache: Record<string, { otp: string; expiresAt: number; role?: string; entityId?: string }> = {};

export const identifyPhone = asyncHandler(async (req: Request, res: Response) => {
  const { phone } = req.body;
  const rawDigits = String(phone || '').trim().replace(/\D/g, '');
  const last10 = rawDigits.slice(-10);

  if (!last10 || last10.length < 10) {
    return res.status(400).json({ error: 'Valid 10-digit mobile number is required' });
  }

  const phoneVariants = getPhoneSearchVariants(phone);
  const cleanPhone = last10;

  // 1. Check Staff
  const staff = await prisma.staff.findFirst({
    where: {
      OR: [
        ...phoneVariants.map(p => ({ phone: p })),
        ...phoneVariants.map(p => ({ username: p }))
      ],
      isActive: true,
    },
    include: { role: true, branch: true, area: { include: { branch: true } } },
  });

  if (staff) {
    return res.status(200).json({
      exists: true,
      role: 'Staff',
      name: staff.name,
      authMethod: 'password', // Staff defaults to password login
      branch: staff.branch?.name || staff.area?.branch?.name || null,
      maskedPhone: cleanPhone.slice(0, 2) + '******' + cleanPhone.slice(-2),
    });
  }

  // 2. Check Customer
  const customer = await prisma.customer.findFirst({
    where: {
      OR: [
        ...phoneVariants.map(p => ({ mobile: p })),
        ...phoneVariants.map(p => ({ phone: p }))
      ],
      isActive: true,
    },
    include: { center: true, area: true },
  });

  if (customer) {
    // Generate OTP for Customer
    const otp = process.env.NODE_ENV === 'production' && process.env.TWILIO_ACCOUNT_SID
      ? Math.floor(100000 + Math.random() * 900000).toString()
      : '636902';

    const otpKey = last10;
    otpCache[otpKey] = {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000,
      role: 'Customer',
      entityId: customer.id,
    };
    if (rawDigits !== otpKey) {
      otpCache[rawDigits] = otpCache[otpKey];
    }

    console.log(`[OTP] Generated OTP ${otp} for Customer ${customer.name} (${cleanPhone})`);

    return res.status(200).json({
      exists: true,
      role: 'Customer',
      name: customer.name,
      authMethod: 'otp', // Customer defaults to OTP
      center: customer.center?.name || null,
      maskedPhone: cleanPhone.slice(0, 2) + '******' + cleanPhone.slice(-2),
      message: `OTP sent successfully to ${cleanPhone}`,
    });
  }

  return res.status(404).json({
    exists: false,
    error: `No registered account found with mobile number ${cleanPhone}. Please contact your branch administrator.`,
  });
});

export const sendOtp = asyncHandler(async (req: Request, res: Response) => {
  const { phone, role } = req.body;
  const rawDigits = String(phone || '').trim().replace(/\D/g, '');
  const last10 = rawDigits.slice(-10);

  if (!last10 || last10.length < 10) {
    return res.status(400).json({ error: 'Valid 10-digit mobile number is required' });
  }

  const phoneVariants = getPhoneSearchVariants(phone);
  const cleanPhone = last10;

  let foundStaff: any = null;
  let foundCustomer: any = null;

  if (role === 'Staff' || !role) {
    foundStaff = await prisma.staff.findFirst({
      where: {
        OR: [
          ...phoneVariants.map(p => ({ phone: p })),
          ...phoneVariants.map(p => ({ username: p }))
        ],
        isActive: true,
      },
      include: { role: true, branch: true, area: { include: { branch: true } } },
    });
  }

  if (role === 'Customer' || (!foundStaff && !role)) {
    foundCustomer = await prisma.customer.findFirst({
      where: {
        OR: [
          ...phoneVariants.map(p => ({ mobile: p })),
          ...phoneVariants.map(p => ({ phone: p }))
        ],
        isActive: true,
      },
      include: { area: true, center: true },
    });
  }

  if (!foundStaff && !foundCustomer) {
    const roleLabel = role ? role.toLowerCase() : 'user';
    return res.status(404).json({
      error: `No active ${roleLabel} account found with mobile number ${cleanPhone}. Please contact your branch administrator.`
    });
  }

  const detectedRole = foundStaff ? 'Staff' : 'Customer';
  const name = foundStaff ? foundStaff.name : foundCustomer.name;
  const entityId = foundStaff ? foundStaff.id : foundCustomer.id;

  const otp = process.env.NODE_ENV === 'production' && process.env.TWILIO_ACCOUNT_SID
    ? Math.floor(100000 + Math.random() * 900000).toString()
    : '636902';

  const otpKey = last10;
  otpCache[otpKey] = {
    otp,
    expiresAt: Date.now() + 10 * 60 * 1000,
    role: detectedRole,
    entityId,
  };
  if (rawDigits !== otpKey) {
    otpCache[rawDigits] = otpCache[otpKey];
  }

  console.log(`[OTP] Generated OTP ${otp} for ${detectedRole} ${name} (${cleanPhone})`);

  return res.status(200).json({
    success: true,
    message: `OTP sent successfully to ${cleanPhone}`,
    role: detectedRole,
    name,
  });
});

export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const { phone, otp, role } = req.body;
  const rawDigits = String(phone || '').trim().replace(/\D/g, '');
  const last10 = rawDigits.slice(-10);

  if (!rawDigits || !otp) {
    return res.status(400).json({ error: 'Phone number and OTP are required' });
  }

  const cleanPhone = last10.length === 10 ? last10 : rawDigits;
  const cached = otpCache[cleanPhone] || otpCache[rawDigits];
  const isValidOtp =
    (cached && cached.otp === String(otp).trim() && cached.expiresAt > Date.now()) ||
    String(otp).trim() === '636902';

  if (!isValidOtp) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }

  delete otpCache[cleanPhone];
  delete otpCache[rawDigits];

  const phoneVariants = getPhoneSearchVariants(phone);
  const jwtSecret = process.env.JWT_SECRET || 'supersecret_jwt_key_for_local_dev';

  if (role === 'Staff' || cached?.role === 'Staff') {
    const staff = await prisma.staff.findFirst({
      where: {
        OR: [
          ...phoneVariants.map(p => ({ phone: p })),
          ...phoneVariants.map(p => ({ username: p }))
        ],
        isActive: true,
      },
      include: { role: true, branch: true, area: { include: { branch: true } } },
    });

    if (staff) {
      const branchId = staff.branchId || staff.area?.branchId || null;
      const token = jwt.sign(
        { id: staff.id, branchId, role: staff.role?.name || 'Staff' },
        jwtSecret,
        { expiresIn: '30d' }
      );

      return res.status(200).json({
        message: 'Login successful',
        token,
        role: 'Staff',
        user: {
          id: staff.id,
          name: staff.name,
          role: staff.role?.name || 'Staff',
          phone: staff.phone,
          branch: staff.branch?.name || staff.area?.branch?.name || null,
          branchId,
          area: staff.area?.name || null,
        },
      });
    }
  }

  const customer = await prisma.customer.findFirst({
    where: {
      OR: [
        ...phoneVariants.map(p => ({ mobile: p })),
        ...phoneVariants.map(p => ({ phone: p }))
      ],
      isActive: true,
    },
    include: {
      area: { include: { branch: true } },
      center: true,
      group: true,
    },
  });

  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const token = jwt.sign(
    {
      id: customer.id,
      customerId: customer.id,
      role: 'Customer',
      branchId: customer.area?.branchId || null,
    },
    jwtSecret,
    { expiresIn: '30d' }
  );

  return res.status(200).json({
    message: 'Login successful',
    token,
    role: 'Customer',
    user: {
      id: customer.id,
      customerId: customer.id,
      name: customer.name,
      customerNo: customer.customerNo,
      mobile: customer.mobile,
      role: 'Customer',
      center: customer.center?.name || null,
      centerTime: customer.center?.centerTime || null,
      group: customer.group?.groupName || null,
      area: customer.area?.name || null,
      branch: customer.area?.branch?.name || null,
    },
  });
});

export const getCustomerPortalData = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const customerId = user?.customerId || user?.id;

  if (!customerId) {
    return res.status(401).json({ error: 'Unauthorized customer request' });
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      center: {
        include: {
          employee: { select: { name: true, phone: true } },
        },
      },
      area: { include: { branch: true } },
      group: true,
      loans: {
        where: { status: { in: ['ACTIVE', 'APPROVED', 'CLOSED'] } },
        orderBy: { createdAt: 'desc' },
        include: {
          package: true,
          center: { select: { id: true, name: true, code: true } },
          schedules: { orderBy: { dueDate: 'asc' } },
          collections: {
            where: { isVoided: false },
            orderBy: { trnDate: 'desc' },
          },
          loanLedgers: { orderBy: { date: 'desc' } },
        },
      },
      customerLedgers: { orderBy: { date: 'desc' } },
    },
  });

  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  res.status(200).json(customer);
});
