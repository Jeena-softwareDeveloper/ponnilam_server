export function getUserRole(user: { role?: string | { name?: string } } | null | undefined): string | undefined {
  if (!user?.role) return undefined;
  return typeof user.role === 'string' ? user.role : user.role.name;
}

export function isAdminUser(user: { role?: string | { name?: string } } | null | undefined): boolean {
  return getUserRole(user) === 'Admin';
}
