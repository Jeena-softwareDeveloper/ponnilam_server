export const LoanStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  DROPPED: 'DROPPED',
  ACTIVE: 'ACTIVE',
  CLOSED: 'CLOSED',
} as const;

export type LoanStatus = (typeof LoanStatus)[keyof typeof LoanStatus];

export const ScheduleStatus = {
  PENDING: 'PENDING',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
} as const;

export type ScheduleStatus = (typeof ScheduleStatus)[keyof typeof ScheduleStatus];

export const NotificationType = {
  PASSWORD_RESET: 'PASSWORD_RESET',
} as const;

export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const NotificationStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export type NotificationStatus = (typeof NotificationStatus)[keyof typeof NotificationStatus];

export const LOAN_COLLECTIBLE_STATUSES: LoanStatus[] = [LoanStatus.APPROVED, LoanStatus.ACTIVE];

export const ALLOWED_LOAN_TRANSITIONS: Record<LoanStatus, LoanStatus[]> = {
  [LoanStatus.PENDING]: [LoanStatus.APPROVED, LoanStatus.DROPPED],
  [LoanStatus.APPROVED]: [LoanStatus.ACTIVE, LoanStatus.DROPPED, LoanStatus.CLOSED],
  [LoanStatus.ACTIVE]: [LoanStatus.CLOSED, LoanStatus.DROPPED],
  [LoanStatus.DROPPED]: [],
  [LoanStatus.CLOSED]: [],
};

export function isValidLoanTransition(from: LoanStatus | string, to: LoanStatus | string): boolean {
  if (from === to) return true;
  const fromKey = from as LoanStatus;
  return (ALLOWED_LOAN_TRANSITIONS[fromKey] || []).includes(to as LoanStatus);
}

export const OPEN_LOAN_STATUSES: LoanStatus[] = [
  LoanStatus.PENDING,
  LoanStatus.APPROVED,
  LoanStatus.ACTIVE,
];

export const UNPAID_SCHEDULE_STATUSES: ScheduleStatus[] = [
  ScheduleStatus.PENDING,
  ScheduleStatus.PARTIAL,
];
