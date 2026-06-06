const DELIM = 0x7e, ESC = 0x7d, XOR = 0x20;

export function encode7E(raw: Buffer): Buffer {
  const chunks: Buffer[] = [];
  for (const b of raw) {
    if (b === DELIM || b === ESC) chunks.push(Buffer.from([ESC, b ^ XOR]));
    else chunks.push(Buffer.from([b]));
  }
  const body = Buffer.concat(chunks);
  return Buffer.concat([Buffer.from([DELIM]), body, Buffer.from([DELIM])]);
}

export function decode7E(frame: Buffer): Buffer | null {
  const out: number[] = [];
  for (let i = 0; i < frame.length; i++) {
    if (frame[i] === ESC) {
      if (++i >= frame.length) return null;
      out.push(frame[i] ^ XOR);
    } else out.push(frame[i]);
  }
  return Buffer.from(out);
}