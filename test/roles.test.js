import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hasAdminAccess,
  hasOwnerAccess,
  normalizeAdminRole,
  publicRoleFlags,
} from '../src/shared/roles.js';

test('normalizeAdminRole accepts only known roles', () => {
  assert.equal(normalizeAdminRole('member'), 'member');
  assert.equal(normalizeAdminRole('admin'), 'admin');
  assert.equal(normalizeAdminRole('owner'), 'owner');
  assert.equal(normalizeAdminRole('true'), 'member');
  assert.equal(normalizeAdminRole(true), 'member');
  assert.equal(normalizeAdminRole(undefined), 'member');
});

test('role helpers derive admin and owner access from adminRole only', () => {
  assert.equal(hasAdminAccess('member'), false);
  assert.equal(hasAdminAccess('admin'), true);
  assert.equal(hasAdminAccess('owner'), true);
  assert.equal(hasOwnerAccess('admin'), false);
  assert.equal(hasOwnerAccess('owner'), true);
});

test('publicRoleFlags exposes the public role contract', () => {
  assert.deepEqual(publicRoleFlags('owner'), {
    adminRole: 'owner',
    isAdmin: true,
    isOwner: true,
  });
  assert.deepEqual(publicRoleFlags('unknown'), {
    adminRole: 'member',
    isAdmin: false,
    isOwner: false,
  });
});