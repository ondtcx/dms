import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_2FA_KEY = 'allowPending2FA';

/**
 * Allows a user who still must enroll in 2FA to call the route.
 * Used only for profile, enrollment, and logout endpoints.
 */
export const AllowPending2FA = () => SetMetadata(ALLOW_PENDING_2FA_KEY, true);
