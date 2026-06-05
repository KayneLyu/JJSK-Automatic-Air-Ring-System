// frame-codec.ts
const FRAME_DELIM = 0x7e;
const ESCAPE = 0x7d;
const ESCAPE_XOR = 0x20;

export function encode(raw: Buffer): Buffer {
  const chunks: Buffer[] = [Buffer.from([FRAME_DELIM])];
  for (const b of raw) {
    if (b === FRAME_DELIM || b === ESCAPE) {
      chunks.push(Buffer.from([ESCAPE, b ^ ESCAPE_XOR]));
    } else {
      chunks.push(Buffer.from([b]));
    }
  }
  chunks.push(Buffer.from([FRAME_DELIM]));
  return Buffer.concat(chunks);
}

export function decode(frame: Buffer): Buffer | null {
  const output: number[] = [];
  for (let i = 0; i < frame.length; i++) {
    if (frame[i] === ESCAPE) {
      if (i + 1 >= frame.length) return null;
      i++;
      output.push(frame[i] ^ ESCAPE_XOR);
    } else {
      output.push(frame[i]);
    }
  }
  return Buffer.from(output);
}