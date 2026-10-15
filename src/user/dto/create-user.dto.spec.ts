import { validate } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

describe('CreateUserDto catalog selection', () => {
  const errorsFor = (selection: object) => validate(
    Object.assign(new CreateUserDto(), {
      name: 'Inspector General',
      email: 'inspector@example.com',
      password: 'Password123!',
      ...selection,
    }),
    { whitelist: true, forbidNonWhitelisted: true },
  );

  it('accepts a single positive catalog ID without a legacy role', async () => {
    expect(await errorsFor({ catalogRoleId: 12 })).toEqual([]);
  });

  it.each([0, -1, 1.5, '12', null, [12], [12, 12]])('rejects invalid or duplicate selections: %p', async (catalogRoleId) => {
    expect(await errorsFor({ catalogRoleId })).not.toHaveLength(0);
  });

  it('preserves omitted selection and legacy role compatibility', async () => {
    expect(await errorsFor({})).toEqual([]);
    expect(await errorsFor({ role: 'profesor' })).toEqual([]);
  });
});
