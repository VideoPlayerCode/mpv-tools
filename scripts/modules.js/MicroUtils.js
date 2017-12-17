/*
 * MICROUTILS.JS (MODULE)
 * Version: 1.0
 * Author: SteveJobzniak
 * URL: https://github.com/SteveJobzniak/mpv-tools
 * License: Apache License, Version 2.0
 */

/* jshint -W097 */
/* global mp, module, require */

'use strict';

var Utils = {};

// NOTE: This is an implementation of a non-recursive quicksort, which doesn't
// risk any stack overflows. This function is necessary because of a MuJS <=
// 1.0.1 bug which causes a stack overflow when running its built-in sort() on
// any large array. See: https://github.com/ccxvii/mujs/issues/55
// Furthermore, this performs optimized case-insensitive sorting.
Utils.quickSort = function(arr, options)
{
    options = options || {};

    var i, sortRef,
        caseInsensitive = !!options.caseInsensitive;

    if (caseInsensitive) {
        sortRef = arr.slice(0);
        for (i = sortRef.length - 1; i >= 0; --i)
            if (typeof sortRef[i] === 'string')
                sortRef[i] = sortRef[i].toLowerCase();

        return Utils.quickSort_Run(arr, sortRef);
    }

    return Utils.quickSort_Run(arr);
};

Utils.quickSort_Run = function(arr, sortRef)
{
    if (arr.length <= 1)
        return arr;

    var hasSortRef = !!sortRef;
    if (!hasSortRef)
        sortRef = arr; // Use arr instead. Makes a direct reference (no copy).

    if (arr.length !== sortRef.length)
        throw 'Array and sort-reference length must be identical';

    // Adapted from a great, public-domain C algorithm by Darel Rex Finley.
    // Original implementation: http://alienryderflex.com/quicksort/
    // Ported by SteveJobzniak and extended to sort via a 2nd reference array,
    // to allow sorting the main array by _any_ criteria via the 2nd array.
    var refPiv, arrPiv, beg = [], end = [], stackMax = -1, stackPtr = 0, L, R;

    beg.push(0); end.push(sortRef.length);
    ++stackMax; // Tracks highest available stack index.
    while (stackPtr >= 0) {
        L = beg[stackPtr]; R = end[stackPtr] - 1;
        if (L < R) {
            if (hasSortRef) // If we have a SEPARATE sort-ref, mirror actions!
                arrPiv = arr[L];
            refPiv = sortRef[L]; // Left-pivot is fastest, no MuJS math needed!

            while (L < R) {
                while (sortRef[R] >= refPiv && L < R) R--;
                if (L < R) {
                    if (hasSortRef)
                        arr[L] = arr[R];
                    sortRef[L++] = sortRef[R];
                }
                while (sortRef[L] <= refPiv && L < R) L++;
                if (L < R) {
                    if (hasSortRef)
                        arr[R] = arr[L];
                    sortRef[R--] = sortRef[L];
                }
            }

            if (hasSortRef)
                arr[L] = arrPiv;
            sortRef[L] = refPiv;

            if (stackPtr === stackMax) {
                beg.push(0); end.push(0); // Grow stacks to fit next elem.
                ++stackMax;
            }

            beg[stackPtr + 1] = L + 1;
            end[stackPtr + 1] = end[stackPtr];
            end[stackPtr++] = L;
        } else {
            stackPtr--;
            // NOTE: No need to shrink stack here. Size-reqs GROW until sorted!
            // (Anyway, MuJS is slow at splice() and wastes time if we shrink.)
        }
    }

    return arr;
};

Utils.dump = function(value)
{
    mp.msg.error(JSON.stringify(value));
};

Utils.benchmarkStart = function(textLabel)
{
    Utils.benchmarkTimestamp = mp.get_time();
    Utils.benchmarkTextLabel = textLabel;
};

Utils.benchmarkEnd = function()
{
    var now = mp.get_time(),
        start = Utils.benchmarkTimestamp ? Utils.benchmarkTimestamp : now,
        elapsed = now - start,
        label = typeof Utils.benchmarkTextLabel === 'string' ? Utils.benchmarkTextLabel : '';
    mp.msg.info('Time Elapsed (Benchmark'+(label.length ? ': '+label : '')+'): '+elapsed+' seconds.');
};

module.exports = Utils;
