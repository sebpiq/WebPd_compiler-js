/*
 * Copyright (c) 2022-2023 Sébastien Piquemal <sebpiq@protonmail.com>, Chris McCormick.
 *
 * This file is part of WebPd
 * (see https://github.com/sebpiq/WebPd).
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { DspGraph, getters, traversers } from '../../dsp-graph'
import { mapObject } from '../../functional-helpers'
import {
    attachColdDspGroup,
    attachIoMessages,
    generateVariableNamesIndex,
} from './variable-names-index'
import {
    buildGraphTraversalSignal,
    getNodeImplementation,
    getNodeImplementationsUsedInGraph,
} from '../compile-helpers'
import { createNamespace, nodeNamespaceLabel } from '../compile-helpers'
import { Compilation, NodeImplementations, Precompilation } from '../types'
import { Sequence, ast } from '../../ast/declare'
import precompileDependencies from './dependencies'
import {
    precompileSignalInletWithNoSource,
    precompileMessageInlet,
    precompileSignalOutlet,
    precompileMessageOutlet,
    precompileInitialization,
    precompileMessageReceivers,
    precompileInlineLoop,
    precompileLoop,
    precompileState,
    precompileCaching,
} from './nodes'
import {
    buildColdDspGroups,
    removeNodesFromTraversal,
    buildHotDspGroup,
    buildInlinableDspGroups,
    buildGroupSinkConnections,
} from './dsp-groups'
import { DspGroup } from '../types'
import { precompileCore, precompileStateClass } from './node-implementations'

export default (compilation: Compilation) => {
    const { graph, precompilation } = compilation
    const nodes = traversers.toNodes(graph, precompilation.graph.fullTraversal)

    // -------------------- NODE IMPLEMENTATIONS ------------------ //
    Object.keys(precompilation.nodeImplementations).forEach((nodeType) => {
        precompileStateClass(compilation, nodeType)
        precompileCore(compilation, nodeType)
    })

    // ------------------------ DSP GROUPS ------------------------ //
    const rootDspGroup: DspGroup = {
        traversal: buildGraphTraversalSignal(graph),
        // TODO : this is duplicate from `buildGraphTraversalSignal`
        outNodesIds: Object.values(graph)
            .filter((node) => !!node.isPullingSignal)
            .map((node) => node.id),
    }
    const coldDspGroups = buildColdDspGroups(compilation, rootDspGroup)
    const hotDspGroup = buildHotDspGroup(
        compilation,
        rootDspGroup,
        coldDspGroups
    )
    const allDspGroups = [hotDspGroup, ...coldDspGroups]
    const inlinableDspGroups = allDspGroups.flatMap((parentDspGroup) => {
        const inlinableDspGroups = buildInlinableDspGroups(
            compilation,
            parentDspGroup
        )
        // Nodes that will be inlined shouldnt be in the traversal for
        // their parent dsp group.
        parentDspGroup.traversal = removeNodesFromTraversal(
            parentDspGroup.traversal,
            inlinableDspGroups.flatMap((dspGroup) => dspGroup.traversal)
        )

        return inlinableDspGroups
    })

    precompilation.graph.hotDspGroup = hotDspGroup
    coldDspGroups.forEach((dspGroup, index) => {
        const groupId = `${index}`
        precompilation.graph.coldDspGroups[groupId] = {
            ...dspGroup,
            sinkConnections: buildGroupSinkConnections(graph, dspGroup),
        }
        attachColdDspGroup(precompilation.variableNamesIndex, groupId)
    })

    // ------------------------ PORTLETS ------------------------ //
    attachIoMessages(
        precompilation.variableNamesIndex,
        compilation.settings,
        graph
    )

    // Go through the graph and precompile inlets.
    nodes.forEach((node) => {
        Object.values(node.inlets).forEach((inlet) => {
            if (inlet.type === 'signal') {
                if (getters.getSources(node, inlet.id).length === 0) {
                    precompileSignalInletWithNoSource(
                        compilation,
                        node,
                        inlet.id
                    )
                }
            } else if (inlet.type === 'message') {
                precompileMessageInlet(compilation, node, inlet.id)
            }
        })
    })

    // Go through the graph and precompile message outlets.
    //
    // For example if a node has only one sink there is no need
    // to copy values between outlet and sink's inlet. Instead we can
    // collapse these two variables into one.
    //
    // We need to compile outlets after inlets because they reference
    // message receivers.
    nodes.forEach((node) => {
        Object.values(node.outlets)
            .filter((outlet) => outlet.type === 'message')
            .forEach((outlet) => {
                precompileMessageOutlet(compilation, node, outlet.id)
            })
    })

    // Go through all dsp groups and precompile signal outlets for nodes that
    // are not inlined.
    allDspGroups.forEach((dspGroup) => {
        traversers.toNodes(graph, dspGroup.traversal).forEach((node) => {
            Object.values(node.outlets).forEach((outlet) => {
                precompileSignalOutlet(compilation, node, outlet.id)
            })
        })
    })

    // ------------------------ DSP ------------------------ //
    inlinableDspGroups.forEach((dspGroup) => {
        precompileInlineLoop(compilation, dspGroup)
    })

    allDspGroups.forEach((dspGroup) => {
        traversers.toNodes(graph, dspGroup.traversal).forEach((node) => {
            precompileCaching(compilation, node)
            precompileLoop(compilation, node)
        })
    })

    // ------------------------ NODE ------------------------ //
    // This must come after we have assigned all node variables.
    nodes.forEach((node) => {
        precompileState(compilation, node)
        precompileInitialization(compilation, node)
        precompileMessageReceivers(compilation, node)
    })

    // ------------------------ MISC ------------------------ //
    precompileDependencies(compilation)
}

export const initializePrecompilation = (
    settings: Compilation['settings'],
    graph: DspGraph.Graph,
    fullTraversal: DspGraph.GraphTraversal,
    nodeImplementations: NodeImplementations,
): Precompilation => {
    const variableNamesIndex = generateVariableNamesIndex(
        settings,
        graph,
        nodeImplementations,
    )
    return {
        variableNamesIndex,
        nodes: createNamespace(
            'nodes',
            mapObject(graph, (node) => ({
                nodeImplementation: getNodeImplementation(
                    nodeImplementations,
                    node.type
                ),
                generationContext: {
                    messageReceivers: createNamespace(
                        nodeNamespaceLabel(
                            node,
                            'generationContext:messageReceivers'
                        ),
                        {}
                    ),
                    signalOuts: createNamespace(
                        nodeNamespaceLabel(
                            node,
                            'generationContext:signalOuts'
                        ),
                        {}
                    ),
                    messageSenders: createNamespace(
                        nodeNamespaceLabel(
                            node,
                            'generationContext:messageSenders'
                        ),
                        {}
                    ),
                    signalIns: createNamespace(
                        nodeNamespaceLabel(node, 'generationContext:signalIns'),
                        {}
                    ),
                    state: variableNamesIndex.nodes[node.id].state,
                },
                messageReceivers: createNamespace(
                    nodeNamespaceLabel(node, 'messageReceivers'),
                    {}
                ),
                messageSenders: createNamespace(
                    nodeNamespaceLabel(node, 'messageSenders'),
                    {}
                ),
                signalOuts: createNamespace(
                    nodeNamespaceLabel(node, 'signalOuts'),
                    {}
                ),
                stateInitialization: null,
                initialization: ast``,
                loop: ast``,
                caching: createNamespace(
                    nodeNamespaceLabel(node, 'caching'),
                    {}
                ),
                state: null,
            }))
        ),
        nodeImplementations: createNamespace(
            'nodeImplementations',
            Object.entries(
                getNodeImplementationsUsedInGraph(graph, nodeImplementations)
            ).reduce<Precompilation['nodeImplementations']>(
                (
                    precompiledImplementations,
                    [nodeType, nodeImplementation]
                ) => ({
                    ...precompiledImplementations,
                    [nodeType]: {
                        nodeImplementation,
                        stateClass: null,
                        core: null,
                    },
                }),
                {}
            )
        ),
        dependencies: {
            imports: [],
            exports: [],
            ast: Sequence([]),
        },
        graph: {
            fullTraversal,
            hotDspGroup: {
                traversal: [],
                outNodesIds: [],
            },
            coldDspGroups: createNamespace('coldDspGroups', {}),
        },
    }
}
