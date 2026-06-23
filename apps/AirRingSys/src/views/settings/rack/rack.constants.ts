export type IState = 'FWD' | 'REV' | 'STOP' | 'HOME' | 'MEASURE'

export interface StateOption {
  label: string
  value: IState
}

export const RUN_STATE_OPTIONS: StateOption[] = [
  { label: '正行', value: 'FWD' },
  { label: '反行', value: 'REV' },
  { label: '停止', value: 'STOP' },
  { label: '归边', value: 'HOME' },
  { label: '扫描', value: 'MEASURE' },
]
