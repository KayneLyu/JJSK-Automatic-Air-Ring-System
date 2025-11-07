import { IAirRingInfo } from './airRing.types'

/**
 * 设置热量
 */
export const setHeats = (params: number[]) => {
  /* TODO */
}

/**
 * 获取热量
 */
export const getHeats = (): number[] => {
  /* TODO */
}

/**
 * 设置自动加热
 */
export const setIsAuto = (params: boolean) => {
  /* TODO */
}

/**
 * 复位加热量
 */
export const resetHeats = () => {
  /* TODO */
}

/**
 * 获取损坏的加热棒
 */
export const getBads = (): boolean[] => {
  /* TODO */
}

/**
 * 开启/停止检测动作
 */
export const setCheckEnable = (params: string) => {
  /* TODO */
}
/**
 * 获取风环报PLC警列表
 */
export const getWarningList = () => {
  /* TODO */
}
/**
 * 清空风环PLC报警列表
 */
export const resetErrCode = () => {
  /* TODO */
}
/**
 * 获取风环基础配置
 */
export const getParam = () => {
  /* TODO */
}
/**
 * 风环状态数据
 */
export const getInfo = (): IAirRingInfo => {
  /* TODO */
}
