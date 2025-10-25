// 接口：参数类型
interface BlowingParams {
    filmWidth: number; // mm
    angleVelocity: number; // min/R
    angleRange: number; // 角度
    // 加其他参数如需
}

// 接口：信号类型（布尔/数值）
interface Signals {
    horizontalPulse: number; // 横向脉冲
    probeValue: number; // 探头值 μm
    leftLimit: boolean; // 左限位
    rightLimit: boolean; // 右限位
    motionDirection: boolean; // 运动方向
    rotationDirection: boolean; // 旋转正反
    rotationPulse: number; // 旋转脉冲
    inverterFreq: number; // 变频频率 Hz
    resetSignal: boolean; // 复位
    swapDirection: boolean; // 换向
}

/**
 * 模拟器 
 */
class SignalSimulator {
    // 编码器比例
    private encoderRatio = 0.14;
    // 机架长度 脉冲
    private rackLength = 13900;
    // 编码脉冲
    private encoderPulse = 1;
    // 电机脉冲
    private motorPulse = 4;

    // 机架总长度 实际 mm
    private rackLengthMm = this.rackLength * this.encoderRatio;

    // 探头移动速度  脉冲/s  
    private probeSpeed = 3000;
    // 探头移动速度  m/min  
    public probeSpeedMm = this.probeSpeed / this.motorPulse * this.encoderRatio * 60 * this.encoderPulse;

    // 探头当前运动方向 0 = 停止 1 = 前进 2 = 后退
    private motionDirection = 0;


    private params: BlowingParams;
    public signals: Signals;


    // 边界查找


    constructor(params?: Partial<BlowingParams>) {
        // 默认参数
        this.params = {
            filmWidth: 1500,
            angleVelocity: 6,
            angleRange: 350,
            ...params // 合并传入
        };

        // 初始化信号
        this.signals = {
            horizontalPulse: 0,
            probeValue: 800,
            leftLimit: false,
            rightLimit: false,
            motionDirection: true,
            rotationDirection: true,
            rotationPulse: 0,
            inverterFreq: 50,
            resetSignal: false,
            swapDirection: false
        };

        console.log('初始探头值:', this.signals.probeValue, 'μm');
        console.log('初始横向脉冲:', this.signals.horizontalPulse);
    }

    // 更新一步（10ms模拟）
    public updateOneStep(deltaTimeMs: number = 10, currAngle: number = 0): void {
        // 横向脉冲：假设扫描速0.1mm/ms
        this.signals.horizontalPulse += Math.floor(0.1 * deltaTimeMs);

        // 探头值：sin波动模拟厚度
        this.signals.probeValue = Math.floor(800 + 100 * Math.sin(currAngle / 180 * Math.PI));

        // 左右限位：基于角度
        const limitThreshold = this.params.angleRange / 2;
        this.signals.leftLimit = currAngle <= -limitThreshold;
        this.signals.rightLimit = currAngle >= limitThreshold;

        // 运动方向：同步旋转
        this.signals.motionDirection = this.signals.rotationDirection;

        // 旋转脉冲：角度变化 → 脉冲 (1° = PosOfR/360)
        const pulsePerDegree = 50000 / 360;
        this.signals.rotationPulse += Math.floor(
            (deltaTimeMs / 1000) * (this.params.angleVelocity * 60 / 360) * pulsePerDegree
        );

        // 变频频率：速度映射
        this.signals.inverterFreq = Math.floor(50 * (this.params.angleVelocity / 6));

        // 复位：角度近0
        this.signals.resetSignal = Math.abs(currAngle) < 5;

        // 换向：限位触发
        this.signals.swapDirection = this.signals.leftLimit || this.signals.rightLimit;

        // 输出（可选，调试用）
        if (deltaTimeMs % 1000 === 0) { // 每1s打印
            console.log(
                `[一步更新] 角度${currAngle.toFixed(1)}°: 横脉冲${this.signals.horizontalPulse}, ` +
                `探头${this.signals.probeValue}μm, 左限${this.signals.leftLimit}, 右限${this.signals.rightLimit}, ` +
                `频率${this.signals.inverterFreq}Hz, 复位${this.signals.resetSignal}, 换向${this.signals.swapDirection}`
            );
        }
    }

    // 实时模拟启动
    public startRealtime(durationMs: number = 10000): NodeJS.Timeout {
        let lastTime = Date.now();
        let simAngle = 0; // 简单匀速

        const intervalId = setInterval(() => {
            const now = Date.now();
            const deltaTime = now - lastTime;
            lastTime = now;

            // 简单角度更新
            simAngle = (simAngle + (this.params.angleVelocity / 6) * (deltaTime / 1000)) % 360;

            this.updateOneStep(deltaTime, simAngle);

            // 每1s摘要
            if (now % 1000 < 10) {
                console.log(
                    `[实时摘要 ${new Date(now).toLocaleTimeString()}] 角度${simAngle.toFixed(1)}°, ` +
                    `总横脉冲${this.signals.horizontalPulse}, 平均探头${Math.floor(this.signals.probeValue)}μm`
                );
            }

            // 超时停
            if (now - lastTime > durationMs) {
                clearInterval(intervalId);
                console.log('🛑 实时模拟结束');
                process.exit(0);
            }
        }, 10); // 10ms

        console.log('🚀 实时模拟启动（', durationMs / 1000, 's后停）');
        return intervalId;
    }
}


// 测试
if (require.main === module) {
    const sim = new SignalSimulator();
    sim.startRealtime(5000);
}

export { SignalSimulator, BlowingParams };
