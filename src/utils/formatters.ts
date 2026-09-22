export function formatYen(amount: number): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  if (abs >= 100_000_000) {
    return `${sign}${(abs / 100_000_000).toFixed(2)}億円`;
  }
  if (abs >= 10_000) {
    return `${sign}${(abs / 10_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}万円`;
  }
  return `${sign}¥${abs.toLocaleString()}`;
}

export function formatYenExact(amount: number): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  return `${sign}¥${Math.abs(amount).toLocaleString()}`;
}

export function formatCoins(coins: number): string {
  const sign = coins > 0 ? '+' : coins < 0 ? '-' : '';
  const abs = Math.abs(coins);
  if (abs >= 10_000) {
    return `${sign}${(abs / 10_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}万枚`;
  }
  return `${sign}${abs.toLocaleString()}枚`;
}

export function formatCoinsExact(coins: number): string {
  const sign = coins > 0 ? '+' : coins < 0 ? '-' : '';
  return `${sign}${Math.abs(coins).toLocaleString()}枚`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}
