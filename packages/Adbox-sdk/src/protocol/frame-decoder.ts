/**
 * 帧解码器
 */
export class FrameDecoder {

    private buffer = Buffer.alloc(0)
  
    push(chunk: Buffer): Buffer[] {
  
      this.buffer = Buffer.concat([
        this.buffer,
        chunk
      ])
  
      const frames: Buffer[] = []
  
      while (true) {
  
        const start = this.buffer.indexOf(0x7e)
  
        if (start === -1) {
  
          this.buffer = Buffer.alloc(0)
  
          break
        }
  
        const end = this.buffer.indexOf(0x7e, start + 1)
  
        if (end === -1) {
          break
        }
  
        const frame = this.buffer.subarray(start + 1, end)
  
        frames.push(frame)
  
        this.buffer = this.buffer.subarray(end + 1)
      }
  
      return frames
    }
  }