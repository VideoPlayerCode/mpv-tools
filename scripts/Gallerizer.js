/*
 * GALLERIZER.JS
 *
 * Description: Image gallery autoloader for mpv.
 * Version:     1.1.0
 * Author:      SteveJobzniak
 * URL:         https://github.com/SteveJobzniak/mpv-tools
 * License:     Apache License, Version 2.0
 */

// Read the bottom of this file for configuration and script setup instructions.

/* jshint -W097 */
/* global mp, require, setTimeout */

'use strict';

var Options = require('Options'),
    PathIndex = require('PathIndex'),
    PathTools = require('PathTools'),
    Utils = require('MicroUtils');

(function() {
    var userConfig = new Options.advanced_options({
        find_extensions: 'jpg,jpeg,png,bmp,gif'
    });

    var debug = false;

    var wantedExts = userConfig.getValue('find_extensions').split(',');

    var autoQueue = function(filename)
    {
        var currentFile = PathTools.getBasename(filename),
            path = PathTools.getPathname(PathTools.makePathAbsolute(filename));
        if (!path || !currentFile)
            return;

        var i, len, file, ext,
            foundAt = -1,
            files = [],
            index = new PathIndex(path, {
                skipDotfiles: true,
                includeDirs: false
            });
        for (i = 0, len = index.files.length; i < len; ++i) {
            file = index.files[i];
            ext = PathTools.getExtension(file);
            if (wantedExts.indexOf(ext) < 0)
                continue;
            if (file === currentFile)
                foundAt = files.length;
            files.push(PathTools.getSubPath(path, file));
        }
        if (foundAt === -1 || files.length <= 1)
            return; // We didn't find target file, or ONLY found that file.

        // Immediately ensure playback is paused, since mpv's playback is async.
        // NOTE: This works even before the player has fully initialized.
        mp.set_property_bool('pause', true);

        // Append all files, including the one we've already started with. This
        // means that it will exist as a duplicate at both offset 0 and X. We
        // cannot trigger any playlist-pos or playlist-move commands to take
        // care of that now, since mpv may not have fully initialized yet, and
        // would just insist on always starting at pos 0.
        for (i = 0, len = files.length; i < len; ++i)
            mp.commandv('loadfile', files[i], 'append');

        // Swap position to the "duplicate" at the real offset, which is the
        // same file and therefore a flicker-free switch. Then delete original.
        mp.set_property('playlist-pos', foundAt + 1);
        mp.commandv('playlist-remove', 0);
    };

    var resolvingDir = false;
    mp.observe_property('playlist/0/playing', 'bool', function(name, isPlaying) {
        var filename, info, ext;
        if (isPlaying && mp.get_property_number('playlist-count') === 1) {
            // There's only a single entry and it started playing. Analyze it.
            filename = mp.get_property('playlist/0/filename');
            if (!filename || PathTools.isWebURL(filename)) {
                resolvingDir = false;
                return;
            }
            info = PathTools.getPathInfo(filename);
            switch (info) {
            case 'dir':
                // We know the next playlist-modification will be loaded
                // folder contents. And since there was only a single
                // playlist entry, we know whole list will be replaced.
                resolvingDir = true;
                if (debug)
                    Utils.dump('resolving dir:'+filename);
                break;
            case 'file':
                resolvingDir = false;
                // The playlist contains a single, local file. Determine
                // if it's from a filetype that we should be autoloading.
                ext = PathTools.getExtension(filename);
                if (wantedExts.indexOf(ext) >= 0) {
                    if (debug)
                        Utils.dump('autoload:'+filename);
                    autoQueue(filename);
                }
                break;
            default: // "missing".
                resolvingDir = false;
            }
        }
    });
    mp.observe_property('playlist/0/filename', 'string', function(name, filename) {
        if (!resolvingDir)
            return;

        // When we load a dir, the whole playlist changes. If the 1st queued
        // file from the dir is a wanted type, we should now pause the playback.
        var ext = PathTools.getExtension(filename);
        if (wantedExts.indexOf(ext) >= 0) {
            if (debug)
                Utils.dump('dir contained autoload filetype, pausing:'+filename);
            mp.set_property_bool('pause', true);
        }

        resolvingDir = false;
    });
})();
