export const MONTHS = [
  'جانفي', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
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
