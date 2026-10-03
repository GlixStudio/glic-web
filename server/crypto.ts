// Ids, tokens and password hashing on WebCrypto (Workers, browsers and Node).

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** ULID: 48-bit millisecond time + 80 random bits, Crockford base32 - sorts by creation time */
export const newId = (now = Date.now()): string => {
    let t = now;
    let time = '';
    for (let i = 0; i < 10; i++) {
        time = CROCKFORD[t % 32] + time;
        t = Math.floor(t / 32);
    }
    const rand = crypto.getRandomValues(new Uint8Array(16));
    let r = '';
    for (let i = 0; i < 16; i++) r += CROCKFORD[rand[i] % 32];
    return (time + r).toLowerCase();
};

const b64 = (bytes: Uint8Array): string => {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
};
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export const randomToken = (bytes = 32): string =>
    b64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const sha256Hex = async (data: string | Uint8Array): Promise<string> => {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
    return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
};

// Cloudflare Workers cap PBKDF2 at 100k iterations
const ITERATIONS = 100_000;

const pbkdf2 = async (password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: salt as Uint8Array<ArrayBuffer>, iterations },
        key,
        256
    );
    return new Uint8Array(bits);
};

/** 'pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>' - a standard, portable format */
export const hashPassword = async (password: string): Promise<string> => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await pbkdf2(password, salt, ITERATIONS);
    return `pbkdf2-sha256$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;
};

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
    const [scheme, iter, salt, hash] = stored.split('$');
    if (scheme !== 'pbkdf2-sha256' || !iter || !salt || !hash) return false;
    const expected = unb64(hash);
    const actual = await pbkdf2(password, unb64(salt), Number(iter));
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
};

// a hash to compare against when the account does not exist, so a login for an
// unknown email takes as long as one with a wrong password
let dummyHash: Promise<string> | null = null;
export const burnPasswordCheck = async (password: string) => {
    dummyHash ??= hashPassword('not-a-real-password');
    await verifyPassword(password, await dummyHash);
};
