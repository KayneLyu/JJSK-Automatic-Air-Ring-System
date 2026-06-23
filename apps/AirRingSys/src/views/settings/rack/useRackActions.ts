import { ref } from 'vue'
import { RUN_STATE_OPTIONS, type IState } from './rack.constants'

export function useRackActions() {
  const runningState = ref<IState>('STOP')
  const targetPulse = ref(1000)

  const stateOptions = RUN_STATE_OPTIONS

  async function changeState(state: IState) {
    switch (state) {
      case 'FWD':
        await window.ipcApi.invoke('adbox-forward')
        break
      case 'REV':
        await window.ipcApi.invoke('adbox-backward')
        break
      case 'STOP':
        await window.ipcApi.invoke('adbox-stop')
        break
      case 'HOME':
        await window.ipcApi.invoke('adbox-home')
        break
      case 'MEASURE':
        await window.ipcApi.invoke('adbox-start-scan')
        break
      default:
        console.warn('未知的状态类型:', state)
    }
  }

  async function moveToPulsePosition() {
    await window.ipcApi.invoke('adbox-move-to', targetPulse.value)
  }

  return {
    runningState,
    targetPulse,
    stateOptions,
    changeState,
    moveToPulsePosition,
  }
}
