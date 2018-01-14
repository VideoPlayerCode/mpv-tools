/*
 * LEAPFROG.JS
 *
 * Description: Effortlessly jump through your playlist, with your own custom
 *              jump size and direction, including the ability to jump randomly.
 *              Excellent when queuing lots of images and using mpv as an image
 *              viewer.
 * Version:     1.7.0
 * Author:      SteveJobzniak
 * URL:         https://github.com/SteveJobzniak/mpv-tools
 * License:     Apache License, Version 2.0
 */

// Read the bottom of this file for configuration and script setup instructions.

/* jshint -W097 */
/* global mp, require */

'use strict';

var Options = require('Options'),
    Utils = require('MicroUtils'),
    Ass = require('AssFormat'),
    Stack = require('Stack'),
    RandomCycle = require('RandomCycle');

var Leapfrog = function(globalOpts)
{
    this.fontSize = globalOpts.fontSize;
    this.fontAlpha = Ass.convertPercentToHex( // Throws if invalid input.
        (typeof globalOpts.fontAlpha === 'number' &&
         globalOpts.fontAlpha >= 0 && globalOpts.fontAlpha <= 1 ?
         globalOpts.fontAlpha : 1),
        true // Invert input range so "1.0" is visible and "0.0" is invisible.
    );
    this.throttleTime = 0;
    this.history = new Stack(200);
    this.randomOrder = {
        rebuild: true,
        cycle: new RandomCycle()
    };

    var self = this;

    this.playlistPos = mp.get_property_number('playlist-pos');
    mp.observe_property('playlist-pos', 'number', function(name, value) {
        self.playlistPos = value;
    });

    this.playlistCount = mp.get_property_number('playlist-count');
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

    // Only use menu text colors while mpv is rendering in GUI mode (non-CLI).
    this.useTextColors = mp.get_property_bool('vo-configured');
    mp.observe_property('vo-configured', 'bool', function(name, value) {
        self.useTextColors = value;
    });
};

Leapfrog.prototype._formatMsg = function(msg, useTextColors)
{
    if (useTextColors === false)
        return msg;
    var out = Ass.startSeq();
    if (this.fontSize > 0)
        out += Ass.size(this.fontSize);
    out += Ass.alpha(this.fontAlpha);
    out += Ass.esc(msg)+Ass.stopSeq();
    return out;
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
    var newPosition, msgPrefix, historyEntry,
        c = this.useTextColors;
    switch (offset) {
    case 'undo-random':
        var previous = this.history.pop();
        if (typeof previous !== 'object' || typeof previous.pos === 'undefined') {
            if (!options.silent && !options.silenterr)
                mp.osd_message(this._formatMsg('Undo: No history.', c));
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
    case 'first':
        newPosition = 0;
        msgPrefix = 'First:';
        break;
    case 'last':
        newPosition = this.playlistCount - 1;
        msgPrefix = 'Last:';
        break;
    default:
        offset = parseInt(offset, 10);
        if (isNaN(offset) || offset === 0) {
            mp.msg.error('Leapfrog: Invalid offset number.');
            if (!options.silent && !options.silenterr)
                mp.osd_message(this._formatMsg('Jump: Invalid offset number.', c));
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
            this._formatMsg(
                msgPrefix+' ('+(newPosition + 1)+' / '+this.playlistCount+')',
                c
            ),
            1.5
        );
};

(function() {
    // Read user configuration (uses defaults for any unconfigured options).
    // * You can override these values via the configuration system, as follows:
    // - Via permanent file: `<mpv config dir>/script-settings/Leapfrog.conf`
    // - Command override: `mpv --script-opts=Leapfrog-font_size=16`
    // - Or by editing this file directly (not recommended, makes your updates harder).
    var userConfig = new Options.advanced_options({
        // What font size to use for the Leapfrog status messages.
        // * NOTE: Final size can vary in non-fullscreen due to mpv's scaling.
        // * (int) Ex: `-1` (use same size as regular OSD), `16` (size 16).
        font_size: -1,
        // How transparent the status text should be (from 0.0 to 1.0).
        // * (float) Ex: `1.0` (fully visible) to `0.0` (fully transparent).
        font_alpha: 1.0
    });

    // Provide the bindable mpv command which performs the playlist jump.
    // * Bind this via input.conf: `ctrl+x script-message Leapfrog -10`.
    // - Jumps can be either positive (ie. `100`) or negative (ie. `-3`).
    // - You can use the word `first` to jump directly to the first entry, or
    //   `last` for the last playlist entry: `script-message Leapfrog first`.
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
    var frog = new Leapfrog({
        fontSize: userConfig.getValue('font_size'),
        fontAlpha: userConfig.getValue('font_alpha')
    });
    mp.register_script_message('Leapfrog', function(offset, rawOptions) {
        frog.jump(offset, rawOptions);
    });
})();
