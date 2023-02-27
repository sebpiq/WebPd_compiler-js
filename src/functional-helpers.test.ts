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

import assert from 'assert'
import { countTo, renderCode } from './functional-helpers'

describe('functional-helpers', () => {
    describe('renderCode', () => {
        it('should render code lines with arbitrary depth', () => {
            const code = renderCode`bla
${['blo', 'bli', ['blu', ['ble', 'bly']]]}`

            assert.strictEqual(code, 'bla\nblo\nbli\nblu\nble\nbly')
        })

        it('should render code lines with numbers', () => {
            const code = renderCode`bla
${['blo', 456.789, ['blu', ['ble', 123]]]}`

            assert.strictEqual(code, 'bla\nblo\n456.789\nblu\nble\n123')
        })

        it('should render number 0 correctly', () => {
            const code = renderCode`bla ${0} ${[0]}`

            assert.strictEqual(code, 'bla 0 0')
        })

        it('should remove empty lines', () => {
            const code = renderCode`bla
${['', 'bli', ['', ['', 'bly']]]}`

            assert.strictEqual(code, 'bla\nbli\nbly')
        })
    })

    describe('countTo', () => {
        it('should generate a list to the count non-inclusive', () => {
            assert.deepStrictEqual(countTo(3), [0, 1, 2])
        })
    })
})
