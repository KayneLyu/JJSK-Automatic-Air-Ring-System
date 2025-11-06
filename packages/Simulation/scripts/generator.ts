import { generate } from 'node-opcua-generator'
import { resolve } from 'node:path'
generate(resolve(__dirname, '../schemas/Thickness.NodeSet2.xml'), 'Thickness')
