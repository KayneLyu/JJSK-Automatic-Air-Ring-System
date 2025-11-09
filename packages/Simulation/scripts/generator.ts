import {
  AddressSpace,
  buildModelInner,
  displayNodeElement,
  nodesets,
  promoteToMandatory,
  setNamespaceMetaData,
} from 'node-opcua-modeler'
import { readNodeSet2XmlFile } from 'node-opcua-address-space/nodeJS'
import { promises } from 'node:fs'

import {
  getPresetSymbolsFromCSV,
  saveSymbolsToCSV,
} from 'node-opcua-modeler/nodeJS'
const { writeFile } = promises
// the namespaceUri
const namespaceUri = 'https://jinjiutech.com/opcua/thickness'
const version = '1.0.0'

// the nodeset file required by your model
const xmlFiles: string[] = [nodesets.standard, nodesets.di]

async function createModel(addressSpace: AddressSpace): Promise<void> {
  const ns = addressSpace.getOwnNamespace()

  const nsDI = addressSpace.getNamespaceIndex('http://opcfoundation.org/UA/DI/')
  if (nsDI < 0) {
    throw new Error('Cannot find DI namespace!')
  }

  const deviceSet =
    addressSpace.rootFolder.objects.getFolderElementByName(`DeviceSet`)
  if (!deviceSet) {
    throw new Error('Cannot find DeviceSet object!')
  }

  const deviceType = addressSpace.findObjectType('DeviceType', nsDI)
  if (!deviceType) {
    throw new Error('Cannot find DeviceType')
  }
  // construct namespace meta data
  setNamespaceMetaData(addressSpace.getOwnNamespace())

  const ThicknessDeviceType = ns.addObjectType({
    browseName: 'ThicknessDeviceType',
    subtypeOf: deviceType,
  })

  const parameterSet = promoteToMandatory(
    ThicknessDeviceType,
    'ParameterSet',
    nsDI
  )

  ns.addVariable({
    browseName: 'HorizontalPulse',
    componentOf: parameterSet,
    dataType: 'Double',
    description:
      '横向脉冲计数 数值增加=前进，反之后退\n表示当前横向位置的脉冲累计',
  })

  ns.addVariable({
    browseName: 'LeftLimit',
    componentOf: parameterSet,
    dataType: 'Boolean',
    description: '左限位信号，表示是否触发左端限位开关（true 为已触发）',
  })

  console.log(displayNodeElement(ThicknessDeviceType))
}
const symbolFilename = './MyModelIds.csv'
;(async () => {
  try {
    const presetSymbols = await getPresetSymbolsFromCSV(symbolFilename)
    const { markdown, xmlModel, symbols } = await buildModelInner({
      xmlLoader: readNodeSet2XmlFile,
      namespaceUri,
      version,
      xmlFiles,
      createModel,
      presetSymbols,
    })
    // save model to a file
    const nodesetFileName = './MyModel'
    await writeFile(`${nodesetFileName}.NodeSet2.xml`, xmlModel, 'utf-8')
    await writeFile(`${nodesetFileName}.md`, markdown, 'utf-8')

    await saveSymbolsToCSV(symbolFilename, symbols)
  } catch (err) {
    console.log('Error', err)
  }
})()
