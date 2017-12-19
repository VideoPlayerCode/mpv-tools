/*
 * LEAPFROG.JS
 *
 * Description: Effortlessly jump through your playlist, with your own custom
 *              jump size and direction, including the ability to jump randomly.
 *              Excellent when queuing lots of images and using mpv as an image
 *              viewer.
 * Version:     1.3.0
 * Author:      SteveJobzniak
 * URL:         https://github.com/SteveJobzniak/mpv-tools
 * License:     Apache License, Version 2.0
 */

// Read the bottom of this file for configuration and script setup instructions.

/* jshint -W097 */
/* global mp, require */

'use strict';

var Stack = require('Stack');

(function() {
    var throttleTime = 0,
        history = new Stack(200),
        playlistPos = mp.get_property_number('playlist-pos'),
        playlistCount = mp.get_property_number('playlist-count');
    mp.observe_property('playlist-pos', 'number', function(name, value) {
        playlistPos = value;
    });
    mp.observe_property('playlist-count', 'number', function(name, value) {
        playlistCount = value;
        // New count means new/changed playlist. Clear unreliable history.
        // NOTE: When people queue folders, count changes to "1" (the folder)
        // and then the real file count, so re-queuing same/diff folders with
        // same amount of files is accurately detected and cleared too.
        history.clearStack();
    });

    // Provide the bindable mpv command which performs the playlist jump.
    // * Bind this via input.conf: `ctrl+x script-message Leapfrog -10`.
    // - Jumps can be either positive (ie. `100`) or negative (ie. `-3`).
    // - Use the word `random` to perform completely random jumps, as follows:
    //   `script-message Leapfrog random`.
    // - To undo your random jumps, use `script-message Leapfrog undo-random`.
    // - You can silence the on-screen message by adding the option "silent"
    //   at the end: `script-message Leapfrog 5 silent`.
    // - To only silence error messages, use "silenterr" instead (this is useful
    //   together with "undo-random" to prevent the error msg when no history).
    // - If you want to be able to hold down the key, you should bind it with
    //   the "repeatable" flag and the "throttle" option, as follows:
    //   `repeatable script-message Leapfrog 1 throttle`. The throttling
    //   ensures playlist progression at a sane pace when the key is held down.
    // - Lastly, you can combine multiple options by separating them with
    //   commas, such as: `Leapfrog random throttle,silent`.
    mp.register_script_message('Leapfrog', function(offset, rawOptions) {
        if (!playlistCount)
            return; // Nothing in playlist.

        // Parse options.
        var i,
            options = {},
            parts = rawOptions ? rawOptions.split(',') : [];
        for (i = 0; i < parts.length; ++i) {
            options[parts[i]] = true;
        }

        // Handle throttling.
        if (options.throttle) {
            var now = mp.get_time_ms();
            if (now - throttleTime < 250) // 0.25s
                return;
            throttleTime = now;
        }

        // Calculate new playlist position.
        var saveOldPosition = false,
            newPosition, msgPrefix;
        switch (offset) {
        case 'undo-random':
            var previousPosition = history.pop();
            if (typeof previousPosition !== 'number') {
                if (!options.silent && !options.silenterr)
                    mp.osd_message('Undo: No history.');
                return;
            }
            newPosition = previousPosition;
            msgPrefix = 'Undo:';
            break;
        case 'random':
            saveOldPosition = true;
            do {
                newPosition = Math.floor(Math.random() * playlistCount);
            } while(newPosition === playlistPos && playlistCount > 1);
            msgPrefix = 'Random:';
            break;
        default:
            offset = parseInt(offset, 10);
            if (isNaN(offset) || offset === 0) {
                mp.msg.error('Leapfrog: Invalid offset number.');
                if (!options.silent && !options.silenterr)
                    mp.osd_message('Jump: Invalid offset number.');
                return;
            }

            newPosition = playlistPos + offset;
            msgPrefix = 'Jump: '+(offset > 0 ? '+' : '')+offset;
        }

        // Clamp position value to edges of playlist.
        if (newPosition < 0)
            newPosition = 0;
        else if (newPosition >= playlistCount)
            newPosition = playlistCount - 1;

        // Save old position to history, but only if different.
        if (saveOldPosition && newPosition !== playlistPos)
            history.push(playlistPos);

        // Update position.
        mp.set_property('playlist-pos', newPosition);

        // Display on-screen feedback.
        if (!options.silent)
            mp.osd_message(
                msgPrefix+' ('+(newPosition + 1)+' / '+playlistCount+')',
                1.5
            );
    });
})();
