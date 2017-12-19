/*
 * LEAPFROG.JS
 *
 * Description: Effortlessly jump through your playlist, with your own custom
 *              jump size and direction, including the ability to jump randomly.
 *              Excellent when queuing lots of images and using mpv as an image
 *              viewer.
 * Version:     1.4.0
 * Author:      SteveJobzniak
 * URL:         https://github.com/SteveJobzniak/mpv-tools
 * License:     Apache License, Version 2.0
 */

// Read the bottom of this file for configuration and script setup instructions.

/* jshint -W097 */
/* global mp, require */

'use strict';

var Utils = require('MicroUtils'),
    Stack = require('Stack'),
    RandomCycle = require('RandomCycle');

var Leapfrog = function()
{
    this.throttleTime = 0;
    this.history = new Stack(200);
    this.randomOrder = {
        rebuild: true,
        cycle: new RandomCycle()
    };
    this.playlistPos = mp.get_property_number('playlist-pos');
    this.playlistCount = mp.get_property_number('playlist-count');

    var self = this;
    mp.observe_property('playlist-pos', 'number', function(name, value) {
        self.playlistPos = value;
    });
    mp.observe_property('playlist-count', 'number', function(name, value) {
        self.playlistCount = value;
        // New count means new/changed playlist. Clear unreliable history.
        // NOTE: When people queue folders, count changes to "1" (the folder)
        // and then the real file count, so re-queuing same/diff folders with
        // the same amount of files is accurately detected and cleared too.
        self.history.clearStack();
        // We must also mark the playlist cycle for rebuilding, so that every
        // playlist modification always begins a new randomly ordered sequence.
        self.randomOrder.rebuild = true;
    });
};

Leapfrog.prototype.jump = function(offset, rawOptions)
{
    if (!this.playlistCount)
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
        if (now - this.throttleTime < 250) // 0.25s
            return;
        this.throttleTime = now;
    }

    // Calculate new playlist position.
    var newPosition, msgPrefix, historyEntry;
    switch (offset) {
    case 'undo-random':
        var previous = this.history.pop();
        if (typeof previous !== 'object' || typeof previous.pos === 'undefined') {
            if (!options.silent && !options.silenterr)
                mp.osd_message('Undo: No history.');
            return;
        }
        newPosition = previous.pos;
        msgPrefix = 'Undo:';
        break;
    case 'random':
        if (this.randomOrder.rebuild) { // Generate deterministic jump-order.
            this.randomOrder.cycle.setCount(this.playlistCount);
            this.randomOrder.rebuild = false;
        }
        historyEntry = {pos: this.playlistPos};
        try {
            newPosition = this.randomOrder.cycle.getNext(this.playlistPos); // Throws.
        } catch (e) { // Safeguard against pos somehow being larger than cycle.
            this.randomOrder.rebuild = true;
            return; // Silently fail and let the user press again to retry.
        }
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

        newPosition = this.playlistPos + offset;
        msgPrefix = 'Jump: '+(offset > 0 ? '+' : '')+offset;
    }

    // Clamp position value to edges of playlist.
    if (newPosition < 0)
        newPosition = 0;
    else if (newPosition >= this.playlistCount)
        newPosition = this.playlistCount - 1;

    // Save old position to history, but only if different.
    if (historyEntry && newPosition !== this.playlistPos)
        this.history.push(historyEntry);

    // Update position.
    mp.set_property('playlist-pos', newPosition);

    // Display on-screen feedback.
    if (!options.silent)
        mp.osd_message(
            msgPrefix+' ('+(newPosition + 1)+' / '+this.playlistCount+')',
            1.5
        );
};

(function() {
    // Provide the bindable mpv command which performs the playlist jump.
    // * Bind this via input.conf: `ctrl+x script-message Leapfrog -10`.
    // - Jumps can be either positive (ie. `100`) or negative (ie. `-3`).
    // - Use the word `random` to perform completely random jumps, as follows:
    //   `script-message Leapfrog random`.
    // - To undo your random jumps, use `script-message Leapfrog undo-random`.
    //   This function always takes you back to the position you were at before
    //   your last random jump. Pressing it multiple times traverses backwards
    //   through the history of random jump locations.
    // - You can silence the on-screen messages by adding the option "silent"
    //   at the end: `script-message Leapfrog 5 silent`.
    // - To only silence error messages, use "silenterr" instead (this is useful
    //   together with "undo-random" to hide the error when history is empty).
    // - If you want to be able to hold down the key, you should bind it with
    //   the "repeatable" flag and the "throttle" option, as follows:
    //   `repeatable script-message Leapfrog 1 throttle`. The throttling
    //   ensures playlist progression at a sane pace when the key is held down.
    // - Lastly, you can combine multiple options by separating them with
    //   commas, such as: `Leapfrog random throttle,silent`.
    // - The randomizer uses an intelligent "random cycle" algorithm which
    //   traverses all playlist entries in a random order and never visits the
    //   same item twice (until it has wrapped around through all entries). The
    //   main reason for this is to achieve a deterministic order for the
    //   "random" and "undo-random" functions, so that you can go back and forth
    //   through the results (and achieving that without using any "forwards
    //   history stack" when going forwards again, since that would have locked
    //   you to being forced to re-watch all history entries you had previously
    //   randomized through, whenever you want to resume going forwards). It
    //   also avoids the annoyance of seeing randomly repeated entries (which
    //   is what you'd naturally see if each keypress was truly randomizing the
    //   selection independently of each other; for example, a truly random
    //   algorithm which randomizes at every press may select an order such as
    //   "3 -> 2 -> 3 -> 2 -> 3 -> 1 -> 4", so true randomness is very bad).
    //   Under the hood, our algorithm instead uses the current playlist
    //   position number to determine what position to visit next (and the
    //   algorithm generates a new, unique order for this every time the
    //   playlist changes). So if you've pressed "random" five times (and
    //   traversed "1 -> 5 -> 3 -> 4 -> 2 -> 6"), and then "undo-random" four
    //   times (which took you back to "5"), and you would prefer to not have to
    //   press "random" four times to travel forwards through the sequence
    //   you've already seen ("3, 4, 2, 6"), then all you have to do is manually
    //   change your current position by going to another playlist entry before
    //   pressing "random" again. Doing so will cause your "random" request to
    //   travel the sequence starting at that playlist entry's position instead.
    //   Try it out and you'll get the hang of the technique! ;-)
    var frog = new Leapfrog();
    mp.register_script_message('Leapfrog', function(offset, rawOptions) {
        frog.jump(offset, rawOptions);
    });
})();
