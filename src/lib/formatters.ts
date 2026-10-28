const phpCurrencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

export function formatPHP(value: number): string {
  return phpCurrencyFormatter.format(value);
}

export function formatPhilippinePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  let nationalNumber: string;

  if (/^09\d{9}$/.test(digits)) {
    nationalNumber = digits.slice(1);
  } else if (/^9\d{9}$/.test(digits)) {
    nationalNumber = digits;
  } else if (/^639\d{9}$/.test(digits)) {
    nationalNumber = digits.slice(2);
  } else {
    return value.trim();
  }

  return `+63 ${nationalNumber.slice(0, 3)} ${nationalNumber.slice(3, 6)} ${nationalNumber.slice(6)}`;
}
