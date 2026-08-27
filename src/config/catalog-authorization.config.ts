export function isCatalogAuthorizationEnabled(
  value: string | undefined = process.env.CATALOG_AUTHORIZATION_ENABLED,
): boolean {
  return value?.toLowerCase() === 'true';
}

export default () => ({
  catalogAuthorizationEnabled: isCatalogAuthorizationEnabled(),
});
