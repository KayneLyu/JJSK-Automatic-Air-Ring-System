export class FrameDecoder {

    private buffer = Buffer.alloc(0)
  
    push(chunk: Buffer): Buffer[] {
  
      this.buffer = Buffer.concat([
        this.buffer,
        chunk
      ])
  
      const frames: Buffer[] = []
  
      while (true) {
  
        // 找结束符
        const end =
          this.buffer.indexOf(0x7e)
  
        // 没有完整帧
        if (end === -1) {
          break
        }
  
        // 提取一帧
        const frame =
          this.buffer.subarray(0, end)
  
        // 移除当前帧
        this.buffer =
          this.buffer.subarray(end + 1)
  
        // 空帧跳过
        if (frame.length === 0) {
          continue
        }
  
        frames.push(frame)
      }
  
      return frames
    }
  }