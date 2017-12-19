/*
 * RANDOMCYCLE.JS (MODULE)
 *
 * Version:     1.0.0
 * Author:      SteveJobzniak
 * URL:         https://github.com/SteveJobzniak/mpv-tools
 * License:     Apache License, Version 2.0
 */

/* jshint -W097 */
/* global mp, module, require, setInterval, clearInterval, setTimeout, clearTimeout */

'use strict';

var Utils = require('MicroUtils');

/**
 * Generates a randomly ordered set and lets you traverse it in any direction.
 *
 * When it comes to randomizing data, this class is vastly superior to a pure
 * "pick a random entry", since this guarantees that you'll never encounter the
 * same entry twice. It also guarantees that the user can traverse forwards as
 * much as they want, and suddenly decide that they want to go back a few steps
 * to land on an entry they just passed through. Since the order is linked, they
 * just have to travel a few steps backwards and they'll reach the entry again.
 *
 * For example, for a set size of 6, you'd have the data `[0,1,2,3,4,5]`.
 * Shuffled, it may look like `[4,5,3,0,1,2]`. If you traverse it forwards
 * and query it about what comes after "3", it would answer "0". If you ask
 * what comes before "3", it would answer "5". Whenever you reach an edge,
 * it wraps around and thereby gives you a perfect cycle/chain which always
 * leads back to where you started, and covers every value along the way.
 *
 * Expressed in "next" order: `3 -> 0 -> 1 -> 2 -> 4 -> 5 -> 3 -> 0 -> 1 -> 2`.
 * And in "previous" order:   `4 -> 2 -> 1 -> 0 -> 3 -> 5 -> 4 -> 2 -> 1 -> 0`.
 */
var RandomCycle = function()
{
    this._count = 0;
    this._shuffled = [];
};

/**
 * Change the size of the set and shuffle the data.
 *
 * This must be done before you can query about any number, and it must be
 * called any time the set size changes.
 */
RandomCycle.prototype.setCount = function(count)
{
    if (!Utils.isInt(count))
        throw 'The count must be a positive integer';
    this._count = count;
    this._shuffled = [];
    for (var i = 0; i < count; ++i) {
        this._shuffled.push(i);
    }
    Utils.shuffle(this._shuffled);
};

/**
 * Shuffle the current dataset again.
 *
 * Can be used anytime you want to re-organize the cycle pattern into a
 * different order.
 */
RandomCycle.prototype.shuffleCycle = function()
{
    Utils.shuffle(this._shuffled);
};

/**
 * Get the next index after the given index.
 *
 * Throws if the given index is out of range of the dataset's count.
 */
RandomCycle.prototype.getNext = function(fromIdx)
{
    var current = this._findIdx(fromIdx), // Throws.
        next = current + 1;
    if (next >= this._count) // Wrap.
        next = 0;

    return this._shuffled[next];
};

/**
 * Get the previous index before the given index.
 *
 * Throws if the given index is out of range of the dataset's count.
 */
RandomCycle.prototype.getPrevious = function(fromIdx)
{
    var current = this._findIdx(fromIdx), // Throws.
        previous = current - 1;
    if (previous < 0) // Wrap.
        previous = this._count - 1;

    return this._shuffled[previous];
};

/**
 * (Internal) Locate an index value in the shuffled dataset.
 *
 *
 * Throws if the given index is out of range of the dataset's count.
 */
RandomCycle.prototype._findIdx = function(idx)
{
    if (!Utils.isInt(idx) || idx < 0 || idx >= this._count)
        throw 'The index must be an integer within the current count-range';
    var foundAt = this._shuffled.indexOf(idx);
    if (foundAt < 0) // Just a safeguard.
        throw 'Unable to find index in shuffled dataset';

    return foundAt;
};

module.exports = RandomCycle;
