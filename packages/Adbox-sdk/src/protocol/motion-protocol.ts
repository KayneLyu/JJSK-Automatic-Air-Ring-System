import { CMD } from '../constans/protocol';
import { Adb2Core } from '../core/adb2-core';

export class MotionProtocol {
  constructor(private core: Adb2Core) {}

  // ==========================================
  // 设置类
  // ==========================================
  async setAxis(axis: number) {
    const buf = Buffer.alloc(1);
    buf.writeUInt8(axis);
    return this.core.send(CMD.SET_AXIS, [buf]);
  }

  async setProfile(profile: number) {
    const buf = Buffer.alloc(1);
    buf.writeUInt8(profile);
    return this.core.send(CMD.SET_PROFILE, [buf]);
  }

  async setSpeed(speed: number) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(speed);
    return this.core.send(CMD.SET_SPEED, [buf]);
  }

  async setStartSpeed(speed: number) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(speed);
    return this.core.send(CMD.SET_START_SPEED, [buf]);
  }

  async setAccTime(time: number) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(time);
    return this.core.send(CMD.SET_ACC_TIME, [buf]);
  }

  async setDecTime(time: number) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(time);
    return this.core.send(CMD.SET_DEC_TIME, [buf]);
  }

  async setHomeSpeed1(speed: number) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(speed);
    return this.core.send(CMD.SET_HOME_SPEED1, [buf]);
  }

  async setHomeSpeed2(speed: number) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(speed);
    return this.core.send(CMD.SET_HOME_SPEED2, [buf]);
  }

  // ==========================================
  // 读取类
  // ==========================================
  async getSpeed() {
    return this.core.send(CMD.GET_SPEED);
  }

  async getStartSpeed() {
    return this.core.send(CMD.GET_START_SPEED);
  }

  async getAccTime() {
    return this.core.send(CMD.GET_ACC_TIME);
  }

  async getDecTime() {
    return this.core.send(CMD.GET_DEC_TIME);
  }

  async getHomeSpeed1() {
    return this.core.send(CMD.GET_HOME_SPEED1);
  }

  async getHomeSpeed2() {
    return this.core.send(CMD.GET_HOME_SPEED2);
  }

  // ==========================================
  // 控制类
  // ==========================================
  async move(
    type: '+' | '-' | 'P',
    value: number,
    serial: number
  ) {
    const buf = Buffer.alloc(9);
    buf.writeUInt8(type.charCodeAt(0), 0);
    buf.writeUInt32BE(value, 1);
    buf.writeUInt32BE(serial, 5);
    return this.core.send(CMD.MOVE, [buf]);
  }

  async stopDec() {
    return this.core.send(CMD.STOP_DECEL);
  }

  async stopEmergency() {
    return this.core.send(CMD.STOP_EMERGENCY);
  }

  async forward(serial: number) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(serial);
    return this.core.send(CMD.FORWARD, [buf]);
  }

  async backward(serial: number) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(serial);
    return this.core.send(CMD.BACKWARD, [buf]);
  }

  async home(serial: number) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(serial);
    return this.core.send(CMD.HOME, [buf]);
  }

  async getResult() {
    return this.core.send(CMD.GET_RESULT);
  }
}