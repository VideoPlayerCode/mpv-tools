/*
 * ASSFORMAT.JS (MODULE)
 *
 * Version:     1.1.0
 * Author:      SteveJobzniak
 * URL:         https://github.com/SteveJobzniak/mpv-tools
 * License:     Apache License, Version 2.0
 */

/* jshint -W097 */
/* global mp, module, require */

'use strict';

var Ass = {};

Ass._startSeq = mp.get_property_osd('osd-ass-cc/0');

Ass._stopSeq = mp.get_property_osd('osd-ass-cc/1');

Ass.startSeq = function(output)
{
    return output === false ? '' : Ass._startSeq;
};

Ass.stopSeq = function(output)
{
    return output === false ? '' : Ass._stopSeq;
};

Ass.esc = function(str, escape)
{
    if (escape === false) // Conveniently disable escaping via the same call.
        return str;
    // Uses the same technique as mangle_ass() in mpv's osd_libass.c:
    // - Treat backslashes as literal by inserting a U+2060 WORD JOINER after
    //   them so libass can't interpret the next char as an escape sequence.
    // - Replace `{` with `\{` to avoid opening an ASS override block. There is
    //   no need to escape the `}` since it's printed literally when orphaned.
    // - See: https://github.com/libass/libass/issues/194#issuecomment-351902555
    return str.replace(/\\/g, '\\\u2060').replace(/\{/g, '\\{');
};

Ass.size = function(fontSize, output)
{
    return output === false ? '' : '{\\fs'+fontSize+'}';
};

Ass.scale = function(scalePercent, output)
{
    return output === false ? '' : '{\\fscx'+scalePercent+'\\fscy'+scalePercent+'}';
};

Ass.alpha = function(transparencyHex, output)
{
    return output === false ? '' : '{\\alpha&H'+transparencyHex+'&}'; // 00-FF.
};

Ass.color = function(rgbHex, output)
{
    return output === false ? '' : '{\\1c&H'+rgbHex.substring(4, 6)+rgbHex.substring(2, 4)+rgbHex.substring(0, 2)+'&}';
};

Ass.white = function(output)
{
    return Ass.color('FFFFFF', output);
};

Ass.gray = function(output)
{
    return Ass.color('909090', output);
};

Ass.yellow = function(output)
{
    return Ass.color('FFFF90', output);
};

Ass.green = function(output)
{
    return Ass.color('90FF90', output);
};

module.exports = Ass;
