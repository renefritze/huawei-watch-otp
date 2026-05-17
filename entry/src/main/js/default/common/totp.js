/**
 * RFC 6238 TOTP / RFC 4226 HOTP — pure JS, zero dependencies.
 * No crypto.subtle, no Node builtins. Runs on JerryScript (LiteWearable).
 */

var B32_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Decode a Base32 string (RFC 4648) to Uint8Array.
 * Strips spaces, dashes, and '=' padding before decoding.
 */
function base32Decode(base32str) {
  var s = base32str.replace(/[\s\-=]/g, '').toUpperCase();
  var bits = 0,
    val = 0,
    idx = 0;
  var out = new Uint8Array(Math.floor((s.length * 5) / 8));
  for (var i = 0; i < s.length; i++) {
    var ci = B32_ALPHA.indexOf(s[i]);
    if (ci === -1) throw new Error('Invalid base32 character: ' + s[i]);
    val = (val << 5) | ci;
    bits += 5;
    if (bits >= 8) {
      out[idx++] = (val >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }
  return out;
}

/* ─── SHA-1 ──────────────────────────────────────────────────────────────── */

function rotl32(x, n) {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

/**
 * SHA-1 (FIPS 180-4). Input: Uint8Array. Output: Uint8Array (20 bytes).
 */
function sha1(data) {
  var len = data.length;
  var bitLen = len * 8;

  // Padding: append 0x80, zeros, then 64-bit big-endian bit length.
  // Total padded length must be a multiple of 64.
  var padLen = len + 1;
  while (padLen % 64 !== 56) padLen++;
  var buf = new Uint8Array(padLen + 8);
  for (var i = 0; i < len; i++) buf[i] = data[i];
  buf[len] = 0x80;
  // zeros already in place; write 64-bit big-endian bit count
  var bitsHi = Math.floor(bitLen / 0x100000000);
  var bitsLo = bitLen >>> 0;
  buf[padLen] = (bitsHi >>> 24) & 0xff;
  buf[padLen + 1] = (bitsHi >>> 16) & 0xff;
  buf[padLen + 2] = (bitsHi >>> 8) & 0xff;
  buf[padLen + 3] = bitsHi & 0xff;
  buf[padLen + 4] = (bitsLo >>> 24) & 0xff;
  buf[padLen + 5] = (bitsLo >>> 16) & 0xff;
  buf[padLen + 6] = (bitsLo >>> 8) & 0xff;
  buf[padLen + 7] = bitsLo & 0xff;

  var h0 = 0x67452301,
    h1 = 0xefcdab89,
    h2 = 0x98badcfe,
    h3 = 0x10325476,
    h4 = 0xc3d2e1f0;
  var W = new Array(80);

  for (var blk = 0; blk < buf.length; blk += 64) {
    for (var j = 0; j < 16; j++) {
      W[j] =
        ((buf[blk + j * 4] << 24) |
          (buf[blk + j * 4 + 1] << 16) |
          (buf[blk + j * 4 + 2] << 8) |
          buf[blk + j * 4 + 3]) >>>
        0;
    }
    for (var j = 16; j < 80; j++) {
      W[j] = rotl32(W[j - 3] ^ W[j - 8] ^ W[j - 14] ^ W[j - 16], 1);
    }

    var a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4;

    for (var t = 0; t < 80; t++) {
      var f, k;
      if (t < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (t < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (t < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      var tmp = (rotl32(a, 5) + f + e + k + W[t]) >>> 0;
      e = d;
      d = c;
      c = rotl32(b, 30);
      b = a;
      a = tmp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  var r = new Uint8Array(20);
  var H = [h0, h1, h2, h3, h4];
  for (var i = 0; i < 5; i++) {
    r[i * 4] = (H[i] >>> 24) & 0xff;
    r[i * 4 + 1] = (H[i] >>> 16) & 0xff;
    r[i * 4 + 2] = (H[i] >>> 8) & 0xff;
    r[i * 4 + 3] = H[i] & 0xff;
  }
  return r;
}

/* ─── HMAC-SHA1 ──────────────────────────────────────────────────────────── */

/**
 * HMAC-SHA1 (RFC 2104). Both arguments are Uint8Array. Returns Uint8Array (20 bytes).
 */
function hmacSha1(keyBytes, msgBytes) {
  var BSZ = 64;
  var k = keyBytes.length > BSZ ? sha1(keyBytes) : keyBytes;
  var key = new Uint8Array(BSZ);
  for (var i = 0; i < k.length; i++) key[i] = k[i];

  var ipad = new Uint8Array(BSZ);
  var opad = new Uint8Array(BSZ);
  for (var i = 0; i < BSZ; i++) {
    ipad[i] = key[i] ^ 0x36;
    opad[i] = key[i] ^ 0x5c;
  }

  var innerBuf = new Uint8Array(BSZ + msgBytes.length);
  for (var i = 0; i < BSZ; i++) innerBuf[i] = ipad[i];
  for (var i = 0; i < msgBytes.length; i++) innerBuf[BSZ + i] = msgBytes[i];
  var ih = sha1(innerBuf);

  var outerBuf = new Uint8Array(BSZ + 20);
  for (var i = 0; i < BSZ; i++) outerBuf[i] = opad[i];
  for (var i = 0; i < 20; i++) outerBuf[BSZ + i] = ih[i];
  return sha1(outerBuf);
}

/* ─── HOTP / TOTP ────────────────────────────────────────────────────────── */

/**
 * RFC 4226 HOTP. Returns zero-padded 6-digit string.
 */
function hotp(secretBase32, counter) {
  var key = base32Decode(secretBase32);
  var msg = new Uint8Array(8);
  // counter as 8-byte big-endian (handles counters up to 2^53 via two 32-bit halves)
  var hi = Math.floor(counter / 0x100000000);
  var lo = counter >>> 0;
  msg[0] = (hi >>> 24) & 0xff;
  msg[1] = (hi >>> 16) & 0xff;
  msg[2] = (hi >>> 8) & 0xff;
  msg[3] = hi & 0xff;
  msg[4] = (lo >>> 24) & 0xff;
  msg[5] = (lo >>> 16) & 0xff;
  msg[6] = (lo >>> 8) & 0xff;
  msg[7] = lo & 0xff;

  var mac = hmacSha1(key, msg);
  var off = mac[19] & 0x0f;
  var code =
    (((mac[off] & 0x7f) << 24) |
      ((mac[off + 1] & 0xff) << 16) |
      ((mac[off + 2] & 0xff) << 8) |
      (mac[off + 3] & 0xff)) >>>
    0;
  return ('000000' + (code % 1000000)).slice(-6);
}

/**
 * RFC 6238 TOTP (SHA-1, 30-second window). Returns 6-digit string.
 */
function totp(secretBase32) {
  return hotp(secretBase32, Math.floor(Date.now() / 1000 / 30));
}

/**
 * Seconds remaining in the current 30-second TOTP window.
 */
function secondsUntilNextCode() {
  return 30 - (Math.floor(Date.now() / 1000) % 30);
}

module.exports = {
  base32Decode: base32Decode,
  hmacSha1: hmacSha1,
  hotp: hotp,
  totp: totp,
  secondsUntilNextCode: secondsUntilNextCode
};
