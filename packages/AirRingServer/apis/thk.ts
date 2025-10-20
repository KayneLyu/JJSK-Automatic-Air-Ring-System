import { IFrameData, IThickInfoData, IWarningList } from './thk.types'

/**
 * 获取当前1幅数据
 * id <= 0 当前数据 / null
 */
export const getFrame = (params: { id: Number } | null): IFrameData => {
  /* TODO */
}
/**
 * 开始测量
 */
export const scan = () => {
  /* TODO */
}

/**
 * 停止测量
 */
export const stop = () => {
  /* TODO */
}

/**
 * 归边
 */
export const org = () => {
  /* TODO */
}
/**
 * 前进
 */
export const forw = () => {
  /* TODO */
}

/**
 * 后退
 */
export const backw = () => {
  /* TODO */
}

/**
 * 轮询数据
 */
export const getInfo = (): IThickInfoData => {
  /* TODO */
}
/**
 * 设置放大倍数
 */
export const setK = () => {
  /* TODO */
}
/**
 * 获取测厚仪报警列表
 */
export const getWarningList = (): IWarningList[] => {
  /* TODO */
}
/**
 *  清空测厚仪报警列表
 */
export const resetErrCode = () => {
  /* TODO */
}
/**
 *  实时厚度数据
 */
export const getTempFrame = (): { D: Array<number | string> } => {
  /* TODO */
}
