import { BrowserWindow } from 'electron'

import { ADBox } from '../../../packages/adbox-sdk'

const adbox = new ADBox({

    host: '192.168.251.12',

    port: 20020,

    reconnect: true
})

adbox.on('connected', () => {

    console.log('ADBOX CONNECTED')
})
adbox.on('ad-data', data => {

    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    win.webContents.send('adbox:data', data)
})

adbox.connect()

