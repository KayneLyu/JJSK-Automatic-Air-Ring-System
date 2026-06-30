import { BaseNode } from 'node-opcua-address-space'
import { NodeClass } from 'node-opcua-data-model'

export const printNodeTree = (node: BaseNode, indent = '') => {
  const { browseName, nodeId } = node
  const nodeClass = NodeClass[node.nodeClass]

  console.log(
    `${indent} ├─ ${browseName}  [${nodeId.toString()}] <${nodeClass}>`
  )
  // 遍历子节点（HasComponent / Organizes）
  const hasComponentRefs = node.findReferences('HasComponent', true) // true = isForward
  const organizesRefs = node.findReferences('Organizes', true)
  const childRefs = [...hasComponentRefs, ...organizesRefs]
  for (const ref of childRefs) {
    printNodeTree(ref.node!, `${indent}│  `)
  }
}
