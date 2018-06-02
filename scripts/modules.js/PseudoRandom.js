/*
 * PSEUDORANDOM.JS (MODULE)
 *
 * Version:     1.0.0
 * Author:      VideoPlayerCode
 * URL:         https://github.com/VideoPlayerCode/mpv-tools
 * License:     Apache License, Version 2.0
 */

/* jshint -W097 */
/* global mp, module, require, setInterval, clearInterval, setTimeout, clearTimeout */

'use strict';

var Utils = require('MicroUtils');

/**
 * Pseudo-random number generator.
 *
 * Always generates the same output sequence based on the given input seed.
 */
var PseudoRandom = function(initialSeed)
{
    // Based on Park-Miller-Carta PRNG (http://www.firstpr.com.au/dsp/rand31/).
    this.setSeed(initialSeed);
};

/**
 * Get the current seed.
 */
PseudoRandom.prototype.getSeed = function()
{
    return this._seed;
};

/**
 * Set the current seed.
 *
 * This is useful for returning the PRNG to an earlier state.
 */
PseudoRandom.prototype.setSeed = function(seed)
{
    if (!Utils.isInt(seed) || seed === 0)
        throw 'The seed must be a positive integer';

    seed = seed % 2147483647;
    if (seed <= 0)
        seed += 2147483646;
    this._seed = seed;
};

/**
 * Returns a pseudo-random value between 1 and 2^32 - 2.
 */
PseudoRandom.prototype.nextSeed = function()
{
    // Generate the next seed based on current seed. Result will always be an
    // integer and can never become 0 (since only a float could lead to that).
    this._seed = this._seed * 16807 % 2147483647;
    return this._seed;
};

/**
 * Returns a pseudo-random floating point number in range [0, 1] (exclusive).
 */
PseudoRandom.prototype.next = function()
{
    // We know that `_nextSeed()` will be 1 to 2147483646 (inclusive), so simply
    // subtract one to turn the result into a float from 0 to 1 (exclusive).
    return (this.nextSeed() - 1) / 2147483646;
};

module.exports = PseudoRandom;
