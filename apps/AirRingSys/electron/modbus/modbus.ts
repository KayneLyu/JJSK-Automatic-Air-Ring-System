// modbus-service.ts
import ModbusRTU from "modbus-serial";

type Task<T> = () => Promise<T>;

class ModbusTCPService {
  private static instance: ModbusTCPService;
  private client: ModbusRTU;

  private isConnected = false;
  private isConnecting = false;

  private queue: Task<any>[] = [];
  private running = false;

  private ip = "";
  private port = 502;
  private unitId = 1;

  private constructor() {
    this.client = new ModbusRTU();
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new ModbusTCPService();
    }
    return this.instance;
  }

  async connect(ip: string, port = 502, unitId = 1) {
    this.ip = ip;
    this.port = port;
    this.unitId = unitId;

    if (this.isConnected || this.isConnecting) return;

    this.isConnecting = true;

    try {
      await this.client.connectTCP(ip, { port });
      this.client.setID(unitId);
      this.client.setTimeout(1000);

      this.isConnected = true;
      console.log("✅ Modbus TCP connected");

      this.bindEvents();
    } catch (err) {
      console.error("❌ connect error:", err);
      this.reconnect();
    } finally {
      this.isConnecting = false;
    }
  }

  private bindEvents() {
    this.client.on("close", () => {
      console.warn("⚠️ connection closed");
      this.isConnected = false;
      this.reconnect();
    });

    this.client.on("error", (err) => {
      console.error("❌ socket error:", err);
      this.isConnected = false;
      this.reconnect();
    });
  }

  private reconnect() {
    setTimeout(() => {
      console.log("🔄 reconnecting...");
      this.connect(this.ip, this.port, this.unitId);
    }, 2000);
  }

  // ===== 队列核心 =====
  private enqueue<T>(task: Task<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const res = await task();
          resolve(res);
        } catch (err) {
          reject(err);
        }
      });

      this.runQueue();
    });
  }

  private async runQueue() {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) continue;
      try {
        await task();
      } catch (err) {
        console.error("❌ task error:", err);
      }
    }

    this.running = false;
  }

  // ===== 对外API =====

  async readHoldingRegisters(address: number, length: number) {
    return this.enqueue(async () => {
      const res = await this.client.readHoldingRegisters(address, length);
      return res.data;
    });
  }

  async writeRegister(address: number, value: number) {
    return this.enqueue(() =>
      this.client.writeRegister(address, value)
    );
  }

  async writeRegisters(address: number, values: number[]) {
    return this.enqueue(() =>
      this.client.writeRegisters(address, values)
    );
  }
}

export default ModbusTCPService;