import { VariableNameGenerators } from './types'

export default (node: PdDspGraph.Node): VariableNameGenerators => ({
    ins: generateInletVariableName.bind(this, node.id),
    outs: generateOutletVariableName.bind(this, node.id),
    state: generateStateVariableName.bind(this, node.id),
})

export const generateInletVariableName = (
    nodeId: PdDspGraph.NodeId,
    inletId: PdSharedTypes.PortletId
) => `${nodeId}_INS_${inletId}`

export const generateOutletVariableName = (
    nodeId: PdDspGraph.NodeId,
    outletId: PdSharedTypes.PortletId
) => `${nodeId}_OUTS_${outletId}`

const generateStateVariableName = (
    nodeId: PdDspGraph.NodeId,
    localVariableName: PdSharedTypes.PortletId
) => `${nodeId}_STATE_${localVariableName}`
