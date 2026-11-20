// Checks and confirmation helpers for barcode scanning. Pure functions, no browser needed.

// Every real product barcode ends with a check digit. A misread usually fails this test.
export function isValidGtin(code) {
  if (typeof code !== "string" || !/^(\d{8}|\d{12,14})$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop();
  let sum = 0;
  digits.reverse().forEach((d, i) => {
    sum += d * (i % 2 === 0 ? 3 : 1);
  });
  return (10 - (sum % 10)) % 10 === check;
}

// A number is only accepted after it has been read several times within a short time.
// One blurry frame that happens to look like a different barcode is therefore ignored.
export function createConfirmer(required = 3, windowMs = 2500) {
  let reads = [];
  return {
    add(code, now) {
      reads.push({ code, now });
      reads = reads.filter((r) => now - r.now <= windowMs);
      const count = reads.filter((r) => r.code === code).length;
      return { count, confirmed: count >= required };
    },
    reset() {
      reads = [];
    },
  };
}