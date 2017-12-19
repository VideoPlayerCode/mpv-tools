/*
 * STACK.JS (MODULE)
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

var Stack = function(maxSize)
{
    if (!Utils.isInt(maxSize) || maxSize === 0)
        throw 'Max stack size must be either -1 (unlimited), or 1 or higher';

    this.stack = [];
    this.position = -1;
    this.maxSize = maxSize;
};

Stack.prototype.push = function(elem)
{
    // Add to end of stack.
    this.stack.push(elem);
    if (this.maxSize !== -1)
        while (this.stack.length > this.maxSize) // Normally only triggers once.
            this.stack.shift(); // Remove 1st and reindex.
    this.position = this.stack.length - 1;
};

Stack.prototype.pop = function()
{
    // Pop from end of stack.
    if (this.position < 0)
        return undefined; // Stack is empty.
    var popped = this.stack.pop();
    this.position = this.stack.length - 1;
    return popped;
};

Stack.prototype.clearStack = function()
{
    // NOTE: We use splice rather than `= []` to ensure old references retrieved
    // via `getStack()` will still point to the active stack after clearing it.
    this.stack.splice(0, this.stack.length);
    this.position = -1;
};

Stack.prototype.getStack = function()
{
    return this.stack;
};

Stack.prototype.getLast = function()
{
    return this.position >= 0 ?
        this.stack[this.position] :
        undefined;
};

Stack.prototype.getCount = function()
{
    return this.position + 1;
};

Stack.prototype.isEmpty = function()
{
    return this.position < 0;
};

module.exports = Stack;
