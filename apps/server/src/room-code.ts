/** Room codes: short, easy to read aloud, and free of look-alike characters. */

/** No 0/O, 1/I or L. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

/** Makes a random room code from `CODE_ALPHABET` using the Web Crypto RNG. */
export function generateRoomCode(length = CODE_LENGTH): string {
  const bytes = new Uint8Array(length);
  let code = '';
  // Rejection sampling keeps every letter equally likely.
  const limit = 256 - (256 % CODE_ALPHABET.length);
  while (code.length < length) {
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < limit && code.length < length) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
    }
  }
  return code;
}

/** True for a code of 5 or 6 characters, all from the alphabet. */
export function isValidRoomCode(code: string): boolean {
  return (
    code.length >= 5 && code.length <= 6 && [...code].every((ch) => CODE_ALPHABET.includes(ch))
  );
}
