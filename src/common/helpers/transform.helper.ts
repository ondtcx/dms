// src/common/helpers/transform.helper.ts

export const toBoolean = ({ value }: { value: any }): boolean => {
  // Si es undefined o null, retornar undefined
  if (value === undefined || value === null) {
    return undefined;
  }

  // Si es string vacío, retornar undefined (para usar el default)
  if (value === '') {
    return undefined;
  }

  // Si ya es boolean, retornarlo
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

// Si necesitas más transformaciones en el futuro:
export const toNumber = ({ value }: { value: any }): number => {
  return Number(value);
};

export const toArray = ({ value }: { value: any }): any[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string')
    return value.split(',').map((item) => item.trim());
  return [];
};
