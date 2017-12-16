/*
 * PLAYLISTMANAGER.JS (MODULE)
 * Version: 1.0
 * Author: SteveJobzniak
 * URL: https://github.com/SteveJobzniak/mpv-tools
 * License: Apache License, Version 2.0
 */

/* jshint -W097 */
/* global mp, module, require */

'use strict';

var PathTools = require('PathTools');

var PlaylistManager = {};

PlaylistManager.getPlaylist = function(itemPos)
{
    var playlist = mp.get_property_native('playlist');
    if (playlist === undefined)
        return null;

    if (typeof itemPos !== 'undefined') { // Single item is desired.
        if (!playlist.length)
            return null;

        if (itemPos === -1) // Get last item.
            return playlist[playlist.length - 1];
        else if (itemPos >= 0 && itemPos < playlist.length) // Specific item.
            return playlist[itemPos];
        else // Invalid position.
            return null;
    }

    return playlist; // Array of all playlist items.
};

PlaylistManager.getCurrentlyPlaying = function(makeAbsolute)
{
    // Attempt to detect the currently playing file (or the first playlist
    // file in case the playlist hasn't been started yet). Will be empty if
    // no playlist exists (such as in mpv's "idle with forced GUI" mode).
    var playlist = PlaylistManager.getPlaylist(),
        playlistItem = playlist.length ? playlist[0] : null,
        fullPath = null;
    for (var i = 0; i < playlist.length; ++i) {
        if (playlist[i] && playlist[i].current) {
            playlistItem = playlist[i];
            break;
        }
    }

    if (playlistItem) {
        fullPath = playlistItem.filename;
        if (makeAbsolute && !PathTools.isWebURL(fullPath))
            // Append the relative path to mpv's working dir (which is
            // what relative playlist files must be resolved against).
            fullPath = PathTools.makePathAbsolute(fullPath);
    }

    return fullPath;
};

PlaylistManager.getCurrentlyPlayingLocal = function(makeAbsolute)
{
    var info = {
        // Grab the current playlist file (if any) and make its path absolute.
        fullPath: PlaylistManager.getCurrentlyPlaying(makeAbsolute),
        pathName: null,
        baseName: null
    };

    // If nothing is queued or it's a web URL, erase it and return.
    if (!info.fullPath || PathTools.isWebURL(info.fullPath)) {
        info.fullPath = null;
        return info;
    }

    // NOTE: Pathname will be empty if this is a relative file that has no dirs.
    info.pathName = PathTools.getPathname(info.fullPath);
    info.baseName = PathTools.getBasename(info.fullPath);

    return info;
};

module.exports = PlaylistManager;
