import { Permissions, PERMISSIONS_KEY } from './permissions.decorator';
import { SetMetadata } from '@nestjs/common';

jest.mock('@nestjs/common', () => ({
  SetMetadata: jest.fn(),
}));

describe('Permissions Decorator', () => {
  it('should call SetMetadata with PERMISSIONS_KEY and provided permissions', () => {
    const permissionsList = ['users:read', 'users:write'];
    
    Permissions(...permissionsList);
    
    expect(SetMetadata).toHaveBeenCalledWith(PERMISSIONS_KEY, permissionsList);
  });

  it('should handle empty permissions', () => {
    Permissions();
    expect(SetMetadata).toHaveBeenCalledWith(PERMISSIONS_KEY, []);
  });
});