export interface ADBoxOptions {
    host: string
    port: number
    reconnect?: boolean
    reconnectInterval?: number
    heartbeatInterval?: number
    timeout?: number
  }
  
  export interface ADData {
    systick: number
  
    ad0: number
  
    ad1?: number
  
    encoder0?: number
  
    encoder1?: number
  
    inputs?: number
  
    outputs?: number
  
    reset?: boolean
  }
  
  export enum ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    RECONNECTING
  }