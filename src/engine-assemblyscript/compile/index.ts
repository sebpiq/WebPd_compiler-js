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
    buildMetadata,
    collectDependenciesFromTraversal,
    engineMinimalDependencies,
} from '../../compile/compile-helpers'
import generateDeclarationsGraph from '../../compile/generate-declarations-graph'
import generateDeclarationsGlobals from '../../compile/generate-declarations-globals'
import generateLoop from '../../compile/generate-loop'
import { renderCode } from '../../functional-helpers'
import { Compilation } from '../../compile/types'
import { AssemblyScriptWasmEngineCode } from './types'
import generateInletCallers from '../../compile/generate-inlet-callers'
import generateOutletListeners from '../../compile/generate-outlet-listeners'
import generateEmbeddedArrays from '../../compile/generate-embedded-arrays'
import generateDeclarationsDependencies from '../../compile/generate-declarations-dependencies'
import generateImportsExports from '../../compile/generate-imports-exports'

export default (compilation: Compilation): AssemblyScriptWasmEngineCode => {
    const {
        audioSettings,
        inletCallerSpecs,
        codeVariableNames,
        macros: { Func, Var },
    } = compilation
    const { channelCount } = audioSettings
    const globs = compilation.codeVariableNames.globs
    const metadata = buildMetadata(compilation)
    const dependencies = [
        ...engineMinimalDependencies(),
        ...collectDependenciesFromTraversal(compilation),
    ]

    // prettier-ignore
    return renderCode`
        ${generateDeclarationsGlobals(compilation)}
        ${generateDeclarationsDependencies(compilation, dependencies)}
        ${generateDeclarationsGraph(compilation)}

        ${generateEmbeddedArrays(compilation)}

        ${generateInletCallers(compilation)}        
        ${generateOutletListeners(compilation, (variableName) => `
            export declare function ${variableName}(m: Message): void
        `)}

        const metadata: string = '${JSON.stringify(metadata)}'
        let ${globs.input}: FloatArray = createFloatArray(0)
        let ${globs.output}: FloatArray = createFloatArray(0)
        
        export function configure(sampleRate: Float, blockSize: Int): void {
            ${globs.input} = createFloatArray(blockSize * ${channelCount.in.toString()})
            ${globs.output} = createFloatArray(blockSize * ${channelCount.out.toString()})
            ${globs.sampleRate} = sampleRate
            ${globs.blockSize} = blockSize
            _commons_emitEngineConfigure()
        }

        export function getInput(): FloatArray { return ${globs.input} }

        export function getOutput(): FloatArray { return ${globs.output} }

        export function loop(): void {
            ${generateLoop(compilation)}
        }

        export {
            metadata,
            ${Object.entries(inletCallerSpecs).map(([nodeId, inletIds]) => 
                inletIds.map(inletId => 
                    codeVariableNames.inletCallers[nodeId][inletId] + ','
                )
            )}
        }

        ${generateImportsExports(
            'assemblyscript',
            dependencies,
            ({ name, args, returns }) => `export declare function ${name} ${Func(args.map((a) => Var(a[0], a[1])), returns)}`, 
            ({ name }) => `export { ${name} }`
        )}
    `
}
