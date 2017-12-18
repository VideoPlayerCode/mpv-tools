/*
 * LEAPFROG.JS
 *
 * Description: Effortlessly jump through your playlist, with your own custom
 *              jump size and direction. Excellent when queuing lots of images
 *              and using mpv as an image viewer.
 * Version:     1.0.0
 * Author:      SteveJobzniak
 * URL:         https://github.com/SteveJobzniak/mpv-tools
 * License:     Apache License, Version 2.0
 */

// Read the bottom of this file for configuration and script setup instructions.

/* jshint -W097 */
/* global mp, require */

'use strict';

(function() {
    var playlistPos = mp.get_property_number('playlist-pos'),
        playlistCount = mp.get_property_number('playlist-count');
    mp.observe_property('playlist-pos', 'number', function(name, value) {
        playlistPos = value;
    });
    mp.observe_property('playlist-count', 'number', function(name, value) {
        playlistCount = value;
    });

    // Provide the bindable mpv command which performs the playlist jump.
    // * Bind this via input.conf: `ctrl+x script-message Leapfrog -10`.
    // - Jumps can be either positive (ie. `100`) or negative (ie. `-3`).
    // - You can silence the on-screen message by adding the word "silent" after
    //   the number, as follows: `ctrl+x script-message Leapfrog 5 silent`.
    mp.register_script_message('Leapfrog', function(offset, options) {
        if (!playlistCount)
            return; // Nothing in playlist.

        offset = parseInt(offset, 10);
        if (isNaN(offset) || offset === 0) {
            mp.msg.error('Leapfrog: Invalid offset number.');
            return;
        }

        var newPosition = playlistPos + offset;
        if (newPosition < 0)
            newPosition = 0;
        else if (newPosition >= playlistCount)
            newPosition = playlistCount - 1;

        mp.set_property('playlist-pos', newPosition);

        if (options !== 'silent')
            mp.osd_message(
                'Jump: '+(offset > 0 ? '+' : '')+offset+
                    ' ('+(newPosition + 1)+' / '+playlistCount+')',
                1.5
            );
    });
})();
