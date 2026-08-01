const ADMIN_ROLES = new Set(['member', 'admin', 'owner']);

export function normalizeAdminRole(role) {
  return ADMIN_ROLES.has(role) ? role : 'member';
}

export function hasAdminAccess(role) {
  const normalized = normalizeAdminRole(role);
  return normalized === 'admin' || normalized === 'owner';
}

export function hasOwnerAccess(role) {
  return normalizeAdminRole(role) === 'owner';
}

export function publicRoleFlags(role) {
  const adminRole = normalizeAdminRole(role);
  return {
    adminRole,
    isAdmin: hasAdminAccess(adminRole),
    isOwner: hasOwnerAccess(adminRole),
  };
}