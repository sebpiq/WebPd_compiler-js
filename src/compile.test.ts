/*
 * Copyright (c) 2012-2020 Sébastien Piquemal <sebpiq@gmail.com>
 *
 * BSD Simplified License.
 * For information on usage and redistribution, and for a DISCLAIMER OF ALL
 * WARRANTIES, see the file, "LICENSE.txt," in this distribution.
 *
 * See https://github.com/sebpiq/WebPd_pd-parser for documentation
 *
 */
import { makeGraph } from '@webpd/dsp-graph/src/test-helpers'
import assert from 'assert'
import compile, { generateAccessorSpecs, validateSettings } from './compile'
import { generate } from './engine-common/engine-variable-names'
import {
    CompilerSettings,
    InletListenerSpecs,
    NodeImplementations,
    AccessorSpecs,
} from './types'

describe('compile', () => {
    const COMPILER_SETTINGS_AS: CompilerSettings = {
        audioSettings: {
            channelCount: { in: 2, out: 2 },
            bitDepth: 32,
        },
        target: 'assemblyscript',
    }

    const COMPILER_SETTINGS_JS: CompilerSettings = {
        audioSettings: {
            channelCount: { in: 2, out: 2 },
            bitDepth: 32,
        },
        target: 'javascript',
    }

    const NODE_IMPLEMENTATIONS: NodeImplementations = {
        DUMMY: {
            loop: () => '',
        },
    }

    it('should compile assemblyscript without error', () => {
        const code = compile({}, {}, COMPILER_SETTINGS_AS)
        assert.strictEqual(typeof code, 'string')
    })

    it('should compile javascript without error', () => {
        const code = compile({}, {}, COMPILER_SETTINGS_JS)
        assert.strictEqual(typeof code, 'string')
    })

    describe('validateSettings', () => {
        it('should validate settings and set defaults', () => {
            const settings = validateSettings({
                target: 'assemblyscript',
                audioSettings: {
                    channelCount: { in: 2, out: 2 },
                    bitDepth: 32,
                },
            })
            assert.deepStrictEqual(settings.inletListenerSpecs, {})
        })

        it('should throw error if bitDepth invalid', () => {
            assert.throws(() =>
                validateSettings({
                    target: 'assemblyscript',
                    channelCount: { in: 2, out: 2 },
                    sampleRate: 44100,
                    bitDepth: 666,
                } as any)
            )
        })
    })

    describe('generateAccessorSpecs', () => {
        it('should generate accessorSpecs according to inletListenerSpecs', () => {
            const engineVariableNames = generate(
                NODE_IMPLEMENTATIONS,
                makeGraph({
                    node1: {
                        inlets: {
                            inlet1: { type: 'message', id: 'inlet1' },
                            inlet2: { type: 'message', id: 'inlet2' },
                        },
                    },
                    node2: {
                        inlets: {
                            inlet1: { type: 'message', id: 'inlet1' },
                        },
                    },
                }),
                false
            )
            const inletListenerSpecs: InletListenerSpecs = {
                node1: ['inlet1', 'inlet2'],
                node2: ['inlet1'],
            }
            const accessorSpecs: AccessorSpecs = generateAccessorSpecs(
                engineVariableNames,
                inletListenerSpecs
            )
            assert.deepStrictEqual(accessorSpecs, {
                node1_INS_inlet1: { type: 'message', access: 'r' },
                node1_INS_inlet2: { type: 'message', access: 'r' },
                node2_INS_inlet1: { type: 'message', access: 'r' },
            })
        })
    })
})
