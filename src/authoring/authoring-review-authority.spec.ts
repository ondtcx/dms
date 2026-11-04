import { canReviewDocument } from './authoring-review-authority';

describe('canReviewDocument', () => {
  it('allows the assigned reviewer', () => {
    expect(
      canReviewDocument({ reviewerId: 'user-2' }, { id: 'user-2', role: 'docente' }),
    ).toBe(true);
  });

  it('rejects a different non-admin reviewer', () => {
    expect(
      canReviewDocument({ reviewerId: 'user-2' }, { id: 'user-1', role: 'rector' }),
    ).toBe(false);
  });

  it('allows an admin to review another assigned reviewer', () => {
    expect(
      canReviewDocument({ reviewerId: 'user-2' }, { id: 'user-1', role: 'admin' }),
    ).toBe(true);
  });

  it.each(['admin', 'rector', 'vicerrector'])(
    'allows %s to review when no reviewer is assigned',
    (role) => {
      expect(canReviewDocument({ reviewerId: null }, { id: 'user-1', role })).toBe(
        true,
      );
    },
  );

  it.each(['docente', 'secretario', 'coordinador', 'profesor', 'estudiante'])(
    'rejects %s when no reviewer is assigned',
    (role) => {
      expect(canReviewDocument({ reviewerId: null }, { id: 'user-1', role })).toBe(
        false,
      );
    },
  );
});
