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

import {
    AudioSettings,
    Code,
    Compilation,
    CompilerTarget,
    Engine,
    GlobalCodeDefinition,
    GlobalCodeDefinitionExport,
    GlobalCodeGenerator,
    GlobalCodeGeneratorWithSettings,
    Module,
    RawModule,
} from './types'
import * as variableNames from './engine-common/code-variable-names'
import { getMacros } from './compile'
import { writeFile } from 'fs/promises'
import {
    buildGraphTraversalDeclare,
    buildGraphTraversalLoop,
} from './compile-helpers'
import { jsCodeToRawModule } from './engine-javascript/test-helpers'
import {
    compileAscCode,
    wasmBufferToRawModule,
} from './engine-assemblyscript/test-helpers'
import {
    mapArray,
    renderCode,
    renderIf,
    renderSwitch,
} from './functional-helpers'
import {
    createRawModule as createAssemblyScriptWasmRawModule,
    createBindings as createAssemblyScriptWasmEngineBindings,
} from './engine-assemblyscript/bindings'
import { createBindings as createJavaScriptEngineBindings } from './engine-javascript/bindings'
import { createModule } from './engine-common/modules-helpers'
import { compileExport as compileAssemblyScriptExport } from './engine-assemblyscript/compile-to-assemblyscript'
import { compileExport as compileJavaScriptExport } from './engine-javascript/compile-to-javascript'
import compileGlobalCode, {
    collectExports,
} from './engine-common/compile-global-code'

export const normalizeCode = (rawCode: string) => {
    const lines = rawCode
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => !!line.length)
    return lines.join('\n')
}

export const round = (v: number, decimals: number = 4) => {
    // Useful to round big numbers in scientific notation, e.g. 3.282417323806467e+38
    if (v > 1000000) {
        return +v.toPrecision(decimals)
    }
    const rounded =
        Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals)
    // Useful to normalise -0 / 0 which compare as different.
    if (rounded === 0) {
        return 0
    }
    return rounded
}

export const makeCompilation = (
    compilation: Partial<Compilation>
): Compilation => {
    const debug = compilation.debug || false
    const target: CompilerTarget = compilation.target || 'javascript'
    const nodeImplementations = compilation.nodeImplementations || {
        DUMMY: { loop: () => '' },
    }
    const graph = compilation.graph || {}
    const arrays = compilation.arrays || {}
    const inletCallerSpecs = compilation.inletCallerSpecs || {}
    const outletListenerSpecs = compilation.outletListenerSpecs || {}
    const graphTraversalDeclare =
        compilation.graphTraversalDeclare ||
        buildGraphTraversalDeclare(graph, inletCallerSpecs)
    const graphTraversalLoop =
        compilation.graphTraversalLoop || buildGraphTraversalLoop(graph)
    const precompiledPortlets = compilation.precompiledPortlets || {
        precompiledInlets: {},
        precompiledOutlets: {},
    }
    const codeVariableNames = variableNames.generate(
        nodeImplementations,
        graph,
        debug
    )
    const audioSettings = compilation.audioSettings || {
        bitDepth: 32,
        channelCount: { in: 2, out: 2 },
    }
    variableNames.attachOutletListeners(codeVariableNames, outletListenerSpecs)
    variableNames.attachInletCallers(codeVariableNames, inletCallerSpecs)
    return {
        ...compilation,
        target,
        graph,
        graphTraversalDeclare,
        graphTraversalLoop,
        nodeImplementations,
        audioSettings,
        arrays,
        outletListenerSpecs,
        inletCallerSpecs,
        macros: getMacros(target),
        codeVariableNames,
        debug,
        precompiledPortlets,
    }
}

interface TestParameters {
    bitDepth: AudioSettings['bitDepth']
    target: CompilerTarget
}

export const TEST_PARAMETERS: Array<TestParameters> = [
    { bitDepth: 32, target: 'javascript' },
    // { bitDepth: 64, target: 'javascript' },
    { bitDepth: 32, target: 'assemblyscript' },
    // { bitDepth: 64, target: 'assemblyscript' },
]

interface CreateTestModuleApplyBindings {
    assemblyscript?: (buffer: ArrayBuffer) => Promise<Module>
    javascript?: (rawModule: RawModule) => Promise<Module>
}

/** Helper function to create a `Module` for running tests. */
export const createTestModule = async <ModuleType extends Module>(
    target: CompilerTarget,
    bitDepth: AudioSettings['bitDepth'],
    code: Code,
    applyBindings: CreateTestModuleApplyBindings = {}
): Promise<ModuleType> => {
    const applyBindingsNonNull: Required<CreateTestModuleApplyBindings> = {
        javascript: async (rawModule) => rawModule,
        assemblyscript: (buffer) => wasmBufferToRawModule(buffer),
        ...applyBindings,
    }

    // Always save latest compilation for easy inspection
    await writeFile(
        `./tmp/latest-compilation.${target === 'javascript' ? 'js' : 'asc'}`,
        code
    )
    switch (target) {
        case 'javascript':
            const rawModule = await jsCodeToRawModule(code)
            const jsModule = await applyBindingsNonNull.javascript(rawModule)
            return jsModule as ModuleType
        case 'assemblyscript':
            const buffer = await compileAscCode(code, bitDepth)
            const ascModule = await applyBindingsNonNull.assemblyscript(buffer)
            return ascModule as ModuleType
    }
}

type TestEngine<ExportsKeys> = Engine & {
    [Property in keyof ExportsKeys]: any
}

type TestEngineExportsKeys = { [name: string]: any }

export const createTestEngine = <ExportsKeys extends TestEngineExportsKeys>(
    target: CompilerTarget,
    bitDepth: AudioSettings['bitDepth'],
    code: Code,
    globalCodeDefinitions: Array<GlobalCodeDefinition> = []
) => {
    const exports = collectExports(target, globalCodeDefinitions)
    // Create modules with bindings containing not only the basic bindings but also raw bindings
    // for all functions exported in `globalCodeDefinitions`
    return createTestModule<TestEngine<ExportsKeys>>(target, bitDepth, code, {
        javascript: async (rawModule) => {
            return createModule(rawModule, {
                ...mapArray(exports, ({ name }) => [
                    String(name),
                    { type: 'raw' },
                ]),
                ...createJavaScriptEngineBindings(rawModule),
            })
        },
        assemblyscript: async (buffer) => {
            const { rawModule, engineData, forwardReferences } =
                await createAssemblyScriptWasmRawModule(buffer)
            const engineBindings = await createAssemblyScriptWasmEngineBindings(
                rawModule,
                engineData,
                forwardReferences
            )
            return createModule(rawModule, {
                ...mapArray(exports, ({ name }) => [
                    String(name),
                    { type: 'raw' },
                ]),
                ...engineBindings,
            })
        },
    })
}

export const runTestSuite = (
    tests: Array<{ description: string; codeGenerator: GlobalCodeGenerator }>,
    globalCodeDefinitions: Array<GlobalCodeDefinition> = []
) => {
    const testModules: Array<[TestParameters, Module]> = []
    let testCounter = 1
    const testFunctionNames = tests.map(() => `test${testCounter++}`)

    beforeAll(async () => {
        for (let testParameters of TEST_PARAMETERS) {
            const { target, bitDepth } = testParameters
            const macros = getMacros(target)
            const { Var, Func } = macros
            const codeGeneratorContext = {
                macros,
                target,
                audioSettings: {
                    bitDepth,
                    channelCount: { in: 2, out: 2 },
                },
            }

            const testsCodeDefinitions: Array<GlobalCodeGeneratorWithSettings> =
                tests.map(({ codeGenerator }, i) => ({
                    codeGenerator: () => `function ${
                        testFunctionNames[i]
                    } ${Func([], 'void')} {
                        ${codeGenerator(codeGeneratorContext)}
                    }`,
                    exports: [{ name: testFunctionNames[i] }],
                }))

            let code = renderCode`
                function reportTestFailure ${Func(
                    [Var('msg', 'string')],
                    'void'
                )} {
                    console.log(msg)
                    throw new Error('test failed')
                }                

                function assert_stringsEqual ${Func(
                    [Var('actual', 'string'), Var('expected', 'string')],
                    'void'
                )} {
                    if (actual !== expected) {
                        reportTestFailure(
                            'Got string "' + actual 
                            + '" expected "' + expected + '"')
                    }
                }

                function assert_booleansEqual ${Func(
                    [Var('actual', 'boolean'), Var('expected', 'boolean')],
                    'void'
                )} {
                    if (actual !== expected) {
                        reportTestFailure(
                            'Got boolean ' + actual.toString() 
                            + ' expected ' + expected.toString())
                    }
                }

                function assert_integersEqual ${Func(
                    [Var('actual', 'Int'), Var('expected', 'Int')],
                    'void'
                )} {
                    if (actual !== expected) {
                        reportTestFailure(
                            'Got integer ' + actual.toString() 
                            + ' expected ' + expected.toString())
                    }
                }
    
                function assert_floatsEqual ${Func(
                    [Var('actual', 'Float'), Var('expected', 'Float')],
                    'void'
                )} {
                    if (actual !== expected) {
                        reportTestFailure(
                            'Got float ' + actual.toString() 
                            + ' expected ' + expected.toString())
                    }
                }

                function assert_floatArraysEqual ${Func(
                    [
                        Var('actual', 'FloatArray'),
                        Var('expected', 'FloatArray'),
                    ],
                    'void'
                )} {
                    if (actual.length !== expected.length) {
                        reportTestFailure(
                            'Arrays of different length ' + actual.toString() 
                            + ' expected ' + expected.toString())
                    }
                    for (let ${Var('i', 'Int')} = 0; i < actual.length; i++) {
                        if (actual[i] !== expected[i]) {
                            reportTestFailure(
                                'Arrays are not equal ' + actual.toString() 
                                + ' expected ' + expected.toString())
                        }
                    }
                }

                ${compileGlobalCode(
                    codeGeneratorContext,
                    [...globalCodeDefinitions, ...testsCodeDefinitions]
                )}

                ${renderIf(
                    target === 'javascript',
                    'const exports = {}'
                )}

                ${compileTestExports(
                    target,
                    collectExports(target, [...globalCodeDefinitions, ...testsCodeDefinitions])
                )}
            `

            testModules.push([
                testParameters,
                await createTestModule(
                    target,
                    bitDepth,
                    code
                ),
            ])
        }
    })

    const _findTestModule = (testParameters: TestParameters) => {
        const matched = testModules.find(([testModuleParameters]) =>
            Object.entries(testModuleParameters).every(
                ([key, value]) =>
                    testParameters[key as keyof TestParameters] === value
            )
        )
        if (!matched) {
            throw new Error(`Test module for ${testParameters} not found`)
        }
        return matched[1]
    }

    tests.forEach(({ description }, i) => {
        it.each(TEST_PARAMETERS)(description, (testParameters) => {
            _findTestModule(testParameters)[testFunctionNames[i]]()
        })
    })
}

export const compileTestExports = (
    target: CompilerTarget,
    exports: Array<GlobalCodeDefinitionExport>
): Code =>
    renderSwitch(
        [
            target === 'assemblyscript',
            exports.map(compileAssemblyScriptExport).join('\n'),
        ],
        [
            target === 'javascript',
            '\n' + exports.map(compileJavaScriptExport).join('\n'),
        ]
    )
