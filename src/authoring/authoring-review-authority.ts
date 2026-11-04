export interface ReviewAuthorityUser {
  id: string;
  role?: string | null;
}

export interface ReviewAuthorityAuthoring {
  reviewerId?: string | null;
}

const REVIEW_AUTHORITY_ROLES = ['admin', 'rector', 'vicerrector'];

export function canReviewDocument(
  authoring: ReviewAuthorityAuthoring,
  user: ReviewAuthorityUser,
): boolean {
  if (authoring.reviewerId) {
    return authoring.reviewerId === user.id || user.role === 'admin';
  }
  return REVIEW_AUTHORITY_ROLES.includes(user.role ?? '');
}
