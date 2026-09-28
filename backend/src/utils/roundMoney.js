// Rounds an amount to 2 decimals, e.g. 0.1 + 0.2 (0.30000000000000004) → 0.3
const roundMoney = (value) => Math.round(value * 100) / 100;

module.exports = roundMoney;
