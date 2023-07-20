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

import assert from 'assert'
import { makeCompilation } from '../test-helpers'
import compileToAssemblyscript from './compile-to-assemblyscript'
import { AssemblyScriptWasmExports, AssemblyScriptWasmImports } from './types'
import { ascCodeToRawModule } from './test-helpers'

const BIT_DEPTH = 32

describe('compileToAssemblyscript', () => {
    it('should have all expected wasm exports when compiled', async () => {
        interface AscRuntimeExports {
            __collect: () => void
            __pin: () => void
            __rtti_base: () => void
            __unpin: () => void
        }

        const rawModule = await ascCodeToRawModule(
            compileToAssemblyscript(
                makeCompilation({
                    target: 'assemblyscript',
                })
            ),
            BIT_DEPTH,
            {
                input: {
                    i_fs_readSoundFile: (): void => undefined,
                    i_fs_writeSoundFile: (): void => undefined,
                    i_fs_openSoundReadStream: (): void => undefined,
                    i_fs_openSoundWriteStream: (): void => undefined,
                    i_fs_sendSoundStreamData: (): void => undefined,
                    i_fs_closeSoundStream: (): void => undefined,
                }
            }
        )

        const expectedExports: AssemblyScriptWasmExports &
            AssemblyScriptWasmImports &
            AscRuntimeExports = {
            configure: () => undefined,
            getOutput: () => undefined,
            getInput: () => undefined,
            loop: () => new Float32Array(),
            createFloatArray: () => undefined,
            x_core_createListOfArrays: () => undefined,
            x_core_pushToListOfArrays: () => undefined,
            x_core_getListOfArraysLength: () => undefined,
            x_core_getListOfArraysElem: () => undefined,
            commons_getArray: () => undefined,
            commons_setArray: () => undefined,
            metadata: new WebAssembly.Global({ value: 'i32' }),
            MSG_FLOAT_TOKEN: new WebAssembly.Global({ value: 'i32' }),
            MSG_STRING_TOKEN: new WebAssembly.Global({ value: 'i32' }),
            x_msg_create: () => undefined,
            x_msg_getTokenTypes: () => undefined,
            x_msg_createTemplate: () => undefined,
            msg_writeStringToken: () => undefined,
            msg_writeFloatToken: () => undefined,
            msg_readStringToken: () => undefined,
            msg_readFloatToken: () => undefined,
            x_fs_onReadSoundFileResponse: () => undefined,
            x_fs_onWriteSoundFileResponse: () => undefined,
            x_fs_onCloseSoundStream: () => undefined,
            x_fs_onSoundStreamData: () => undefined,
            i_fs_readSoundFile: () => undefined,
            i_fs_writeSoundFile: () => undefined,
            i_fs_openSoundReadStream: () => undefined,
            i_fs_openSoundWriteStream: () => undefined,
            i_fs_sendSoundStreamData: () => undefined,
            i_fs_closeSoundStream: () => undefined,
            __new: () => undefined,
            memory: new WebAssembly.Memory({ initial: 128 }),
            __collect: () => undefined,
            __pin: () => undefined,
            __rtti_base: () => undefined,
            __unpin: () => undefined,
        }

        assert.deepStrictEqual(
            Object.keys(rawModule).sort(),
            Object.keys(expectedExports).sort()
        )
    })
})
