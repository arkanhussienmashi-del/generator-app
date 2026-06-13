export const MONTHS = [
  '01', '02', '03', '04', '05', '06',
  '07', '08', '09', '10', '11', '12'
];

export const CURRENT_YEAR = new Date().getFullYear();
export const CURRENT_MONTH = new Date().getMonth();

export function generateYears(): number[] {
  const years: number[] = [];
  for (let y = CURRENT_YEAR + 1; y >= CURRENT_YEAR - 5; y--) {
    years.push(y);
  }
  return years;
}

export function calcTotal(ampere: number, pricePerAmpere: number): number {
  return ampere * pricePerAmpere;
}
