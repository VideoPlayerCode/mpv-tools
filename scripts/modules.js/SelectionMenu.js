/*
 * SELECTIONMENU.JS (MODULE)
 * Version: 1.0
 * Author: SteveJobzniak
 * URL: https://github.com/SteveJobzniak/mpv-tools
 * License: Apache License, Version 2.0
 */

/* jshint -W097 */
/* global mp, module, require, setInterval, clearInterval, setTimeout, clearTimeout */

'use strict';

var Ass = require('AssFormat'),
    Utils = require('MicroUtils');

var SelectionMenu = function(settings)
{
    settings = settings || {};

    this.uniqueId = 'M'+String(mp.get_time_ms()).replace(/\./g, '').substring(3)+
        Math.floor((100+(Math.random()*899)));
    this.metadata = null;
    this.title = 'No title';
    this.options = [];
    this.selectionIdx = 0;
    this.cbMenuShow = typeof settings.cbMenuShow === 'function' ? settings.cbMenuShow : null;
    this.cbMenuHide = typeof settings.cbMenuHide === 'function' ? settings.cbMenuHide : null;
    this.cbMenuLeft = typeof settings.cbMenuLeft === 'function' ? settings.cbMenuLeft : null;
    this.cbMenuRight = typeof settings.cbMenuRight === 'function' ? settings.cbMenuRight : null;
    this.cbMenuOpen = typeof settings.cbMenuOpen === 'function' ? settings.cbMenuOpen : null;
    this.cbMenuUndo = typeof settings.cbMenuUndo === 'function' ? settings.cbMenuUndo : null;
    this.maxLines = typeof settings.maxLines === 'number' &&
        settings.maxLines >= 3 ? Math.floor(settings.maxLines) : 10;
    this.menuFontSize = typeof settings.menuFontSize === 'number' &&
        settings.menuFontSize >= 1 ? Math.floor(settings.menuFontSize) : 40;
    this.originalFontSize = null;
    this.hasRegisteredKeys = false; // Also means that menu is active/open.
    this.useTextColors = true;
    this.currentMenuText = '';
    this.isShowingMessage = false;
    this.currentMessageText = '';
    this.menuInterval = null;
    this.stopMessageTimeout = null;
    this.autoCloseDelay = typeof settings.autoCloseDelay === 'number' &&
        settings.autoCloseDelay >= 0 ? settings.autoCloseDelay : 5; // 0 = Off.
    this.autoCloseActiveAt = 0;
    this.keyBindings = { // Default keybindings.
        'Menu-Up':{repeatable:true, keys:['up']},
        'Menu-Down':{repeatable:true, keys:['down']},
        'Menu-Up-Fast':{repeatable:true, keys:['shift+up']},
        'Menu-Down-Fast':{repeatable:true, keys:['shift+down']},
        'Menu-Left':{repeatable:true, keys:['left']},
        'Menu-Right':{repeatable:false, keys:['right']},
        'Menu-Open':{repeatable:false, keys:['enter']},
        'Menu-Undo':{repeatable:false, keys:['bs']},
        'Menu-Help':{repeatable:false, keys:['h']},
        'Menu-Close':{repeatable:false, keys:['esc']}
    };

    // Apply custom rebinding overrides if provided.
    // Format: `{'Menu-Open':['a','shift+b']}`
    // Note that all "shift variants" MUST be specified as "shift+<key>".
    var i, action, key, allKeys, erasedDefaults,
        rebinds = settings.keyRebindings;
    if (rebinds) {
        for (action in rebinds) {
            if (!rebinds.hasOwnProperty(action))
                continue;
            if (!this.keyBindings.hasOwnProperty(action))
                throw 'Invalid menu action "'+action+'" in rebindings';
            erasedDefaults = false;
            allKeys = rebinds[action];
            for (i = 0; i < allKeys.length; ++i) {
                key = allKeys[i];
                if (typeof key !== 'string')
                    throw 'Invalid non-string key ('+JSON.stringify(key)+') in custom rebindings';
                key = key.toLowerCase(); // Unify case of all keys for de-dupe.
                key = key.replace(/(?:^\s+|\s+$)/g, ''); // Trim whitespace.
                if (!key.length)
                    continue;
                if (!erasedDefaults) { // Erase default keys for this action.
                    erasedDefaults = true;
                    this.keyBindings[action].keys = [];
                }
                this.keyBindings[action].keys.push(key);
            }
        }
    }

    // Verify that no duplicate bindings exist for the same key.
    var boundKeys = {};
    for (action in this.keyBindings) {
        if (!this.keyBindings.hasOwnProperty(action))
            continue;
        allKeys = this.keyBindings[action].keys;
        for (i = 0; i < allKeys.length; ++i) {
            key = allKeys[i];
            if (boundKeys.hasOwnProperty(key))
                throw 'Invalid duplicate menu bindings for key "'+key+'" (detected in action "'+action+'")';
            boundKeys[key] = true;
        }
    }
};

SelectionMenu.prototype.setMetadata = function(metadata)
{
    this.metadata = metadata;
};

SelectionMenu.prototype.getMetadata = function()
{
    return this.metadata;
};

SelectionMenu.prototype.setTitle = function(newTitle)
{
    if (typeof newTitle !== 'string')
        throw 'setTitle: No title value provided';
    this.title = newTitle;
};

SelectionMenu.prototype.setOptions = function(newOptions, initialSelectionIdx)
{
    if (typeof newOptions === 'undefined')
        throw 'setOptions: No options value provided';
    this.options = newOptions;
    this.selectionIdx = typeof initialSelectionIdx === 'number' &&
        initialSelectionIdx >= 0 && initialSelectionIdx < newOptions.length ?
        initialSelectionIdx : 0;
};

SelectionMenu.prototype.setCallbackMenuShow = function(newCbMenuShow)
{
    this.cbMenuShow = typeof newCbMenuShow === 'function' ? newCbMenuShow : null;
};

SelectionMenu.prototype.setCallbackMenuHide = function(newCbMenuHide)
{
    this.cbMenuHide = typeof newCbMenuHide === 'function' ? newCbMenuHide : null;
};

SelectionMenu.prototype.setCallbackMenuLeft = function(newCbMenuLeft)
{
    this.cbMenuLeft = typeof newCbMenuLeft === 'function' ? newCbMenuLeft : null;
};

SelectionMenu.prototype.setCallbackMenuRight = function(newCbMenuRight)
{
    this.cbMenuRight = typeof newCbMenuRight === 'function' ? newCbMenuRight : null;
};

SelectionMenu.prototype.setCallbackMenuOpen = function(newCbMenuOpen)
{
    this.cbMenuOpen = typeof newCbMenuOpen === 'function' ? newCbMenuOpen : null;
};

SelectionMenu.prototype.setCallbackMenuUndo = function(newCbMenuUndo)
{
    this.cbMenuUndo = typeof newCbMenuUndo === 'function' ? newCbMenuUndo : null;
};

SelectionMenu.prototype.setUseTextColors = function(value)
{
    var hasChanged = this.useTextColors !== value;
    this.useTextColors = !!value;
    // Update text cache, and redraw menu if visible (otherwise don't show it).
    if (hasChanged)
        this.renderMenu(null, 1); // 1 = Only redraw if menu is onscreen.
};

SelectionMenu.prototype.isMenuActive = function()
{
    return this.hasRegisteredKeys; // If keys are registered, menu is active.
};

SelectionMenu.prototype.getSelectedItem = function()
{
    if (this.selectionIdx < 0 || this.selectionIdx >= this.options.length)
        return '';
    else
        return this.options[this.selectionIdx];
};

SelectionMenu.prototype._processBindings = function(fnCb)
{
    if (typeof fnCb !== 'function')
        throw 'Missing callback for _processBindings';

    var i, key, allKeys, action, identifier,
        bindings = this.keyBindings;
    for (action in bindings) {
        if (!bindings.hasOwnProperty(action))
            continue;

        allKeys = bindings[action].keys;
        for (i = 0; i < allKeys.length; ++i) {
            key = allKeys[i];
            identifier = this.uniqueId+'_'+action+'_'+key;
            fnCb(
                identifier, // Unique identifier for this binding.
                action, // What action the key is assigned to trigger.
                key, // What key.
                bindings[action] // Details about this binding.
            );
        }
    }
};

SelectionMenu.prototype._registerMenuKeys = function()
{
    if (this.hasRegisteredKeys)
        return;

    // Necessary in order to preserve "this" in the called function, since mpv's
    // callbacks don't receive "this" if the object's func is keybound directly.
    var createFn = function(obj, fn) {
        return function() {
            obj._menuAction(fn);
        };
    };

    var self = this;
    this._processBindings(function(identifier, action, key, details) {
        mp.add_forced_key_binding(
            key, // What key.
            identifier, // Unique identifier for the binding.
            createFn(self, action), // Generate anonymous func to execute.
            {repeatable:details.repeatable} // Extra options.
        );
    });

    this.hasRegisteredKeys = true;
};

SelectionMenu.prototype._unregisterMenuKeys = function()
{
    if (!this.hasRegisteredKeys)
        return;

    var self = this;
    this._processBindings(function(identifier, action, key, details) {
        mp.remove_key_binding(
            identifier // Remove binding by its unique identifier.
        );
    });


    this.hasRegisteredKeys = false;
};

SelectionMenu.prototype._menuAction = function(action)
{
    if (this.isShowingMessage && action !== 'Menu-Close')
        return; // Block everything except "close" while showing a message.

    switch (action) {
    case 'Menu-Up':
    case 'Menu-Down':
    case 'Menu-Up-Fast':
    case 'Menu-Down-Fast':
        var maxIdx = this.options.length - 1;

        if (action === 'Menu-Up' || action === 'Menu-Up-Fast')
            this.selectionIdx -= (action === 'Menu-Up-Fast' ? 10 : 1);
        else
            this.selectionIdx += (action === 'Menu-Down-Fast' ? 10 : 1);

        // Handle wraparound in single-move mode, or clamp in fast-move mode.
        if (this.selectionIdx < 0)
            this.selectionIdx = (action === 'Menu-Up-Fast' ? 0 : maxIdx);
        else if (this.selectionIdx > maxIdx)
            this.selectionIdx = (action === 'Menu-Down-Fast' ? maxIdx : 0);

        this.renderMenu();
        break;
    case 'Menu-Left':
    case 'Menu-Right':
    case 'Menu-Open':
    case 'Menu-Undo':
        var cbName = 'cb'+action.replace(/-/g, '');
        if (typeof this[cbName] === 'function') {
            // We don't know what the callback will do, and it may be slow, so
            // we'll disable the menu's auto-close timeout while it runs.
            this._disableAutoCloseTimeout(); // Soft-disable.
            this[cbName]();
        }
        break;
    case 'Menu-Help':
        // List all keybindings to help the user remember them.
        var entry, entryTitle, allKeys,
            c = this.useTextColors,
            helpLines = 0,
            helpString = Ass.startSeq(c),
            bindings = this.keyBindings;
        for (entry in bindings) {
            if (!bindings.hasOwnProperty(entry))
                continue;
            allKeys = bindings[entry].keys;
            if (!entry.match(/^Menu-/) || !allKeys || !allKeys.length)
                continue;
            entryTitle = entry.substring(5);
            if (!entryTitle.length)
                continue;
            Utils.quickSort(allKeys, {caseInsensitive: true});
            ++helpLines;
            helpString += Ass.yellow(c)+Ass.esc(entryTitle, c)+': '+
                Ass.white(c)+Ass.esc('{'+allKeys.join('}, {')+'}', c)+'\n';
        }
        helpString += Ass.stopSeq(c);
        if (!helpLines)
            helpString = 'No help available.';
        this.showMessage(helpString, 5000);
        break;
    case 'Menu-Close':
        this.hideMenu();
        break;
    default:
        mp.msg.error('Unknown menu action "'+action+'"');
        return;
    }

    this._updateAutoCloseTimeout(); // Soft-update.
};

SelectionMenu.prototype._disableAutoCloseTimeout = function(forceLock)
{
    this.autoCloseActiveAt = forceLock ? -2 : -1; // -2 = hard, -1 = soft.
};

SelectionMenu.prototype._updateAutoCloseTimeout = function(forceUnlock)
{
    if (!forceUnlock && this.autoCloseActiveAt === -2)
        return; // Do nothing while autoclose is locked in "disabled" mode.

    this.autoCloseActiveAt = mp.get_time();
};

SelectionMenu.prototype._handleAutoClose = function()
{
    if (this.autoCloseDelay <= 0 || this.autoCloseActiveAt <= -1) // -2 = hard, -1 = soft.
        return; // Do nothing while autoclose is disabled (0) or locked (< 0).

    var now = mp.get_time();
    if (this.autoCloseActiveAt <= (now - this.autoCloseDelay))
        this.hideMenu();
};

SelectionMenu.prototype._renderActiveText = function()
{
    if (!this.isMenuActive())
        return;

    // Determine which text to render (critical messages take precedence).
    var msg = this.isShowingMessage ? this.currentMessageText : this.currentMenuText;
    if (typeof msg !== 'string')
        msg = '';

    // Tell mpv's OSD to show the text. It will automatically be replaced and
    // refreshed every second while the menu remains open, to ensure that
    // nothing else is able to overwrite our menu text.
    // NOTE: The long display duration is important, because the JS engine lacks
    // real threading, so any slow mpv API calls or slow JS functions will delay
    // our redraw timer! Without a long display duration, the menu would vanish.
    // NOTE: If a timer misses multiple intended ticks, it will only tick ONCE
    // when catching up. So there can thankfully never be any large "backlog"!
    mp.osd_message(msg, 1000);
};

SelectionMenu.prototype.renderMenu = function(selectionPrefix, renderMode)
{
    var c = this.useTextColors,
        finalString;

    // Title.
    finalString = Ass.startSeq(c)+Ass.gray(c)+Ass.scale(75, c)+
        Ass.esc(this.title, c)+':'+Ass.scale(100, c)+Ass.white(c)+'\n\n';

    // Options.
    if (this.options.length > 0) {
        // Calculate start/end offsets around focal point.
        var startIdx = this.selectionIdx - Math.floor(this.maxLines / 2);
        if (startIdx < 0)
            startIdx = 0;

        var endIdx = startIdx + this.maxLines - 1,
            maxIdx = this.options.length - 1;
        if (endIdx > maxIdx)
            endIdx = maxIdx;

        // Increase number of leading lines if we've reached end of list.
        var lineCount = (endIdx - startIdx) + 1, // "+1" to count start line too.
            lineDiff = this.maxLines - lineCount;
        startIdx -= lineDiff;
        if (startIdx < 0)
            startIdx = 0;

        // Format and add all output lines.
        for (var i = startIdx; i <= endIdx; ++i) {
            if (i === this.selectionIdx)
                // NOTE: Prefix stays on screen until cursor-move or re-render.
                finalString += Ass.yellow(c)+'> '+(typeof selectionPrefix === 'string' ?
                                                   Ass.esc(selectionPrefix, c)+' ' : '');
            finalString += (
                i === startIdx && startIdx > 0 ? '...' :
                    (
                        i === endIdx && endIdx < maxIdx ? '...' : Ass.esc(this.options[i], c)
                    )
            );
            if (i === this.selectionIdx)
                finalString += Ass.white(c);
            if (i !== endIdx)
                finalString += '\n';
        }
    }

    // End the Advanced SubStation command sequence.
    finalString += Ass.stopSeq(c);

    // Update cached menu text. But only open/redraw the menu if it's already
    // active OR if we're NOT being prevented from going out of "hidden" state.
    this.currentMenuText = finalString;

    // Handle render mode:
    // 1 = Only redraw if menu is onscreen (doesn't trigger open/redrawing if
    // the menu is closed or busy showing a text message); 2 = Don't show/redraw
    // at all (good for just updating the text cache silently); any other value
    // (incl. undefined, aka default) = show/redraw the menu.
    if ((renderMode === 1 && (!this.isMenuActive() || this.isShowingMessage)) || renderMode === 2)
        return;
    this._showMenu();
};

SelectionMenu.prototype._showMenu = function()
{
    var justOpened = false;
    if (!this.isMenuActive()) {
        justOpened = true;
        this.originalFontSize = mp.get_property_number('osd-font-size');
        mp.set_property('osd-font-size', this.menuFontSize);
        this._registerMenuKeys();

        // Redraw the currently active text every second and do periodic tasks.
        // NOTE: This prevents other OSD scripts from removing our menu text.
        var self = this;
        if (this.menuInterval !== null)
            clearInterval(this.menuInterval);
        this.menuInterval = setInterval(function() {
            self._renderActiveText();
            self._handleAutoClose();
        }, 1000);

        // Get rid of any lingering "stop message" timeout and message.
        this.stopMessage(true);
    }

    // Display the currently active text instantly.
    this._renderActiveText();

    if (justOpened) {
        // Run "menu show" callback if registered.
        if (typeof this.cbMenuShow === 'function') {
            this._disableAutoCloseTimeout(); // Soft-disable while CB runs.
            this.cbMenuShow();
        }

        // Force an update/unlock of the activity timeout when menu opens.
        this._updateAutoCloseTimeout(true); // Hard-update.
    }
};

SelectionMenu.prototype.hideMenu = function()
{
    if (!this.isMenuActive())
        return;

    mp.osd_message('');
    if (this.originalFontSize !== null)
        mp.set_property('osd-font-size', this.originalFontSize);
    this._unregisterMenuKeys();
    if (this.menuInterval !== null) {
        clearInterval(this.menuInterval);
        this.menuInterval = null;
    }

    // Get rid of any lingering "stop message" timeout and message.
    this.stopMessage(true);

    // Run "menu hide" callback if registered.
    if (typeof this.cbMenuHide === 'function')
        this.cbMenuHide();
};

SelectionMenu.prototype.showMessage = function(msg, durationMs, clearSelectionPrefix)
{
    if (!this.isMenuActive())
        return;

    if (typeof msg !== 'string')
        msg = 'showMessage: Invalid message value.';
    if (typeof durationMs !== 'number')
        durationMs = 800;

    if (clearSelectionPrefix)
        this.renderMenu(null, 2); // 2 = Only update text cache (no redraw).

    this.isShowingMessage = true;
    this.currentMessageText = msg;
    this._renderActiveText();
    this._disableAutoCloseTimeout(true); // Hard-disable (ignore msg idle time).

    var self = this;
    if (this.stopMessageTimeout !== null)
        clearTimeout(this.stopMessageTimeout);
    this.stopMessageTimeout = setTimeout(function() {
        self.stopMessage();
    }, durationMs);
};

SelectionMenu.prototype.stopMessage = function(preventRender)
{
    if (this.stopMessageTimeout !== null) {
        clearTimeout(this.stopMessageTimeout);
        this.stopMessageTimeout = null;
    }
    this.isShowingMessage = false;
    this.currentMessageText = '';
    if (!preventRender)
        this._renderActiveText();
    this._updateAutoCloseTimeout(true); // Hard-update (last user activity).
};

module.exports = SelectionMenu;
