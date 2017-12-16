/*
 * PATHINDEX.JS (MODULE)
 * Version: 1.0
 * Author: SteveJobzniak
 * URL: https://github.com/SteveJobzniak/mpv-tools
 * License: Apache License, Version 2.0
 */

/* jshint -W097 */
/* global mp, module, require */

'use strict';

var Utils = require('MicroUtils');

var PathIndex = function(path, settings)
{
    this.path = path;
    this.dirs = [];
    this.files = [];
    this.skipDotfiles = false;
    this.includeDirs = true;
    this.includeFiles = true;
    this.dirFilterRgx = null;
    this.fileFilterRgx = null;
    this.changeSettings(settings);
    this.update();
};

PathIndex.prototype.changeSettings = function(settings)
{
    settings = settings || {};
    if (typeof settings.skipDotfiles !== 'undefined')
        this.skipDotfiles = !!settings.skipDotfiles;
    if (typeof settings.includeDirs !== 'undefined')
        this.includeDirs = !!settings.includeDirs;
    if (typeof settings.includeFiles !== 'undefined')
        this.includeFiles = !!settings.includeFiles;
    if (typeof settings.dirFilterRgx !== 'undefined')
        this.dirFilterRgx = settings.dirFilterRgx;
    if (typeof settings.fileFilterRgx !== 'undefined')
        this.fileFilterRgx = settings.fileFilterRgx;
};

PathIndex.prototype._readdir = function(path, type)
{
    if (typeof path !== 'string')
        throw '_readdir: No path provided';

    // NOTE: Items are listed in "filesystem order", which MAY not be sorted.
    var result = mp.utils.readdir(path, type);
    if (result === undefined)
        throw '_readdir: '+mp.last_error()+' ("'+path+'")';

    // If filtering is enabled, we'll ONLY keep files MATCHING the filter!
    var filterRgx = type === 'dirs' ? this.dirFilterRgx : this.fileFilterRgx;
    if (filterRgx || this.skipDotfiles) {
        for (var i = result.length - 1; i >= 0; --i) {
            if (
                (this.skipDotfiles && result[i].charAt(0) === '.') ||
                    (filterRgx && !filterRgx.exec(result[i]))
            ) {
                result.splice(i, 1);
            }
        }
    }

    // Sort all items in case-insensitive alphabetical order.
    Utils.quickSort(result, {caseInsensitive: true});

    return result;
};

PathIndex.prototype.update = function(newPath, newSettings)
{
    // Change the path and/or settings if requested.
    if (typeof newPath === 'string')
        this.path = newPath;
    if (typeof newSettings !== 'undefined')
        this.changeSettings(newSettings);

    // Attempt to load the directory contents.
    try {
        // NOTE: Blocks whole JS engine until done! Throws if bad path!
        var dirs = this.includeDirs ? this._readdir(this.path, 'dirs') : [],
            files = this.includeFiles ? this._readdir(this.path, 'files') : [];

        this.dirs = dirs;
        this.files = files;
    } catch (e) {
        this.dirs = [];
        this.files = [];
        throw e;
    }
};

module.exports = PathIndex;
