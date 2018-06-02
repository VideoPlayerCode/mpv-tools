/*
 * PATHTOOLS.JS (MODULE)
 * Version: 1.0
 * Author: VideoPlayerCode
 * URL: https://github.com/VideoPlayerCode/mpv-tools
 * License: Apache License, Version 2.0
 */

/* jshint -W097 */
/* global mp, module, require */

'use strict';

var PathIndex = require('PathIndex');

var PathTools = {};

PathTools.getCwd = function(strictErrors)
{
    var cwdPath = mp.utils.getcwd();
    if (cwdPath)
        return cwdPath;
    if (strictErrors)
        throw mp.last_error();
    return '';
};

PathTools._isUnix = null;
PathTools._isMac = null;
PathTools._pathSep = null;

PathTools._detectOS = function()
{
    var cwdPath = PathTools.getCwd(true); // Throws.

    // Detect Unix/Linux/macOS if the path starts with a forward slash.
    PathTools._isUnix = cwdPath.charAt(0) === '/';
    PathTools._isMac = false; // Mac is also Unix, but we'll detect separately.
    PathTools._pathSep = PathTools._isUnix ? '/' : '\\';

    // Differentiate macOS from other Unix-like systems.
    if (PathTools._isUnix) {
        var unameResult = mp.utils.subprocess({
            args: ['uname', '-s'], // "Linux" or "Darwin" (Mac) or "BSD", etc.
            cancellable: false // Cannot be interrupted by user playback.
        });
        if (typeof unameResult.stdout === 'string' && unameResult.stdout.match(/^\s*Darwin\s*$/))
            PathTools._isMac = true;
    }
};

PathTools.isUnix = function()
{
    if (PathTools._isUnix === null)
        PathTools._detectOS();
    return PathTools._isUnix;
};

PathTools.isMac = function()
{
    if (PathTools._isMac === null)
        PathTools._detectOS();
    return PathTools._isMac;
};

PathTools.pathSep = function()
{
    if (PathTools._pathSep === null)
        PathTools._detectOS();
    return PathTools._pathSep;
};

PathTools.getPathInfo = function(path)
{
    // Use the modern file_info() API if the user's mpv is built with it!
    if (mp.utils.file_info) {
        var fileInfo = mp.utils.file_info(path);
        return fileInfo ? (fileInfo.is_dir ? 'dir' : 'file') : 'missing';
    }

    // Fallback: Check if it's a dir by attempting to list directories in it.
    // NOTE: Misdetects on permission issues, but best we can do for old mpv.
    try {
        var dirContents = new PathIndex(path, { // Throws.
            // Skips file query, and just asks for directories (filtered out).
            includeFiles: false,
            dirFilterRgx: /^$/
        });
        return 'dir';
    } catch (e) {}

    // It's either an unreadable directory, or a file, or missing. We'll use
    // a trick (reading 1 byte) to check if it's a (readable) file.
    try {
        // NOTE: We must read at least 1 byte (0 doesn't work). And the docs
        // claim that the function "allows text content only". Seems to only
        // affect the write function, since reading binary actually works!
        // NOTE: This properly works on (and detects) 0-byte files too.
        var data = mp.utils.read_file(path, 1); // Throws.
        return 'file';
    } catch (e) {
        return 'missing';
    }
};

PathTools.getParentPath = function(path)
{
    if (PathTools._isUnix === null || PathTools._pathSep === null)
        PathTools._detectOS();
    var pathParts = path.split(PathTools._pathSep),
        previousDir = null;
    if (pathParts.length > 1) // Refuse to remove last remaining (drive root).
        previousDir = pathParts.pop();
    var newPath = pathParts.join(PathTools._pathSep);
    if (PathTools._isUnix && !newPath.length) // Preserve unix drive root.
        newPath = '/';
    if (!newPath.length) // Safeguard against empty parent path result.
        newPath = path;
    return {
        path: path, // Original input.
        newPath: newPath, // May still be empty (or "/") if path was empty.
        previousDir: previousDir // May be null.
    };
};

PathTools.getSubPath = function(path, file)
{
    if (PathTools._isUnix === null || PathTools._pathSep === null)
        PathTools._detectOS();
    return (PathTools._isUnix && path === '/' ? '/' : path+PathTools._pathSep)+file;
};

PathTools.getPathname = function(path)
{
    if (PathTools._pathSep === null)
        PathTools._detectOS();
    // If there is no path separator, we assume there is no path (empty string).
    var filenameSep = path.lastIndexOf(PathTools._pathSep);
    return filenameSep >= 0 ? path.substring(0, filenameSep) : '';
};

PathTools.getBasename = function(path)
{
    if (PathTools._pathSep === null)
        PathTools._detectOS();
    // If there is no path separator, we assume the whole path is a filename.
    var filenameSep = path.lastIndexOf(PathTools._pathSep);
    return filenameSep >= 0 ? path.substring(filenameSep + 1) : path;
};

PathTools.getExtension = function(path, includeDotfiles, noLowerCase) {
    var filename = PathTools.getBasename(path);
    var match = includeDotfiles ?
        filename.match(/\.([^.]+)$/) :
        filename.match(/[^.]\.([^.]+)$/);
    return match ? (noLowerCase ? match[1] : match[1].toLowerCase()) : null;
};

PathTools.isPathAbsolute = function(path)
{
    if (PathTools._isUnix === null)
        PathTools._detectOS();
    return (
        // Unix paths always start from "/" (even network paths).
        (PathTools._isUnix && path.charAt(0) === '/') ||
        // Windows paths are "C:" (disk) or "\\XYZ" (network).
        (!PathTools._isUnix && path.match(/^(?:[a-z]:|\\\\[a-z])/i))
    );
};

PathTools.makePathAbsolute = function(path)
{
    return PathTools.isPathAbsolute(path) ? path :
        PathTools.getSubPath(PathTools.getCwd(), path);
};

PathTools.isWebURL = function(path)
{
    return path && path.match(/^[^:]+:\/\//);
};

module.exports = PathTools;
