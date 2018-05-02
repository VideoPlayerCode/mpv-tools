/*
 * COLORBOX.JS
 *
 * Description: Apply color correction presets.
 * Version:     1.0.0
 * Author:      SteveJobzniak
 * URL:         https://github.com/SteveJobzniak/mpv-tools
 * License:     Apache License, Version 2.0
 */

// Read the bottom of this file for configuration and script setup instructions.

/* jshint -W097 */
/* global mp, require, setTimeout */

'use strict';

var Options = require('Options'),
    Utils = require('MicroUtils'),
    Ass = require('AssFormat'),
    SelectionMenu = require('SelectionMenu');

(function() {
    var userConfig = new Options.advanced_options({
        presets: [],
        startup_preset: '',
        auto_close: 5,
        max_lines: 10,
        font_size: 40,
        font_alpha: 1.0,
        'keys_menu_up': '{up}',
        'keys_menu_down': '{down}',
        'keys_menu_up_fast': '{shift+up}',
        'keys_menu_down_fast': '{shift+down}',
        'keys_menu_left': '{left}',
        'keys_menu_right': '{right}',
        'keys_menu_open': '{enter}',
        'keys_menu_undo': '{bs}',
        'keys_menu_help': '{h}',
        'keys_menu_close': '{esc}'
    });

    var menu = new SelectionMenu({ // Throws if bindings are illegal.
        maxLines: userConfig.getValue('max_lines'),
        menuFontAlpha: userConfig.getValue('font_alpha'),
        menuFontSize: userConfig.getValue('font_size'),
        autoCloseDelay: userConfig.getValue('auto_close'),
        keyRebindings: {
            'Menu-Up': userConfig.getMultiValue('keys_menu_up'),
            'Menu-Down': userConfig.getMultiValue('keys_menu_down'),
            'Menu-Up-Fast': userConfig.getMultiValue('keys_menu_up_fast'),
            'Menu-Down-Fast': userConfig.getMultiValue('keys_menu_down_fast'),
            'Menu-Left': userConfig.getMultiValue('keys_menu_left'),
            'Menu-Right': userConfig.getMultiValue('keys_menu_right'),
            'Menu-Open': userConfig.getMultiValue('keys_menu_open'),
            'Menu-Undo': userConfig.getMultiValue('keys_menu_undo'),
            'Menu-Help': userConfig.getMultiValue('keys_menu_help'),
            'Menu-Close': userConfig.getMultiValue('keys_menu_close')
        }
    });

    var reloadTitle = '[Reload Configuration]',
        resetTitle = '[Reset Image Settings]';

    var buildMenuOptions = function(presets)
    {
        var i, len, parts, title, values,
            presetCache = {},
            menuOpts = [];
        menuOpts.push({
            menuText: reloadTitle,
            preset: 'reload'
        });
        menuOpts.push({
            menuText: resetTitle,
            preset: 'reset'
        });
        for (i = 0, len = presets.length; i < len; ++i) {
            parts = presets[i].split(';');

            title = 'Invalid preset';
            values = null;

            if (parts.length) {
                switch(parts[0]) {
                case 'v1':
                    if (parts.length < 7)
                        break;
                    title = parts.slice(7).join(';').replace(/^\s+|\s+$/g, '');
                    if (!title.length)
                        title = 'Untitled preset';
                    values = {
                        contrast:   parseFloat(parts[1]),
                        brightness: parseFloat(parts[2]),
                        gamma:      parseFloat(parts[3]),
                        saturation: parseFloat(parts[4]),
                        hue:        parseFloat(parts[5]),
                        sharpen:    parseFloat(parts[6])
                    };
                    presetCache[title] = values;
                    break;
                }
            }

            menuOpts.push({
                'menuText': title,
                'preset': values
            });
        }

        var paddedIdx,
            missingPadLen,
            totalPadLen = (String(menuOpts.length - 2)).length;
        if (totalPadLen < 2)
            totalPadLen = 2;
        for (i = 2, len = menuOpts.length; i < len; ++i) {
            paddedIdx = String(i - 1);
            missingPadLen = paddedIdx.length - totalPadLen;
            if (missingPadLen < 0)
                paddedIdx = '0000000000'.slice(missingPadLen)+paddedIdx;
            menuOpts[i].menuText = paddedIdx + ': ' + menuOpts[i].menuText;
        }

        return {
            presetCache: presetCache,
            menuOpts: menuOpts
        };
    };

    menu.setTitle('Colorbox Fast-look Presets');

    var presetCache = {};
    var rebuild = function(reload) {
        if (reload) { // TODO: This is a hacky solution... Make it better?
            var newConfig = new Options.advanced_options({presets:[]});
            userConfig.options.presets = newConfig.getValue('presets');
        }
        var built = buildMenuOptions(userConfig.getValue('presets'));
        presetCache = built.presetCache;
        menu.setOptions(built.menuOpts, 2);
        if (reload && menu.isMenuActive())
            menu.renderMenu(); // Update and clear prefix.
    };
    rebuild();

    var applyLook = function(values) {
        if (values === 'reset')
            values = { contrast:0, brightness: 0, gamma: 0,
                       saturation: 0, hue: 0, sharpen: 0.0 };

        if (!values || typeof values !== 'object')
            return false; // Nothing to apply.

        for (var prop in values) {
            if (values.hasOwnProperty(prop))
                mp.set_property(prop, values[prop]);
        }

        return true; // Successfully applied object properties.
    };

    var applyLookWithFeedback = function(title, values) {
        var success = applyLook(values);
        mp.osd_message(
            Ass.startSeq()+Ass.size(14)+
            'Colorbox: '+(!success ? 'Failed to apply ' : '')+'"'+title+'".'
        );
    };

    var handleMenuAction = function(action) {
        var selection = menu.getSelectedItem();
        if (selection.preset === 'reload') {
            rebuild(true);
            return;
        }
        switch (action) {
        case 'Menu-Open':
            menu.hideMenu();
            if (selection.menuText && selection.preset) // Avoids invalid presets.
                applyLookWithFeedback(selection.menuText, selection.preset);
            break;
        case 'Menu-Right':
            var success = applyLook(selection.preset);
            menu.renderMenu(success ? '*' : '-');
            break;
        }
    };

    menu.setCallbackMenuOpen(handleMenuAction);
    menu.setCallbackMenuRight(handleMenuAction);

    mp.add_key_binding(null, 'Colorbox', function() {
        if (!menu.isMenuActive())
            menu.renderMenu();
        else
            menu.hideMenu();
    });

    var applyLookByName = function(lookName) {
        var title, values;
        if (lookName === 'reset') {
            title = resetTitle;
            values = 'reset';
        } else if (presetCache.hasOwnProperty(lookName)) {
            title = lookName;
            values = presetCache[lookName];
        } else {
            var err = 'Colorbox: Cannot find preset "'+lookName+'".';
            mp.osd_message(Ass.startSeq()+Ass.size(14)+err);
            mp.msg.warn(err);
            return;
        }
        applyLookWithFeedback(title, values);
    };

    mp.register_script_message('Colorbox_ApplyLook', function(lookName) {
        applyLookByName(lookName);
    });

    var startupPreset = userConfig.getValue('startup_preset');
    if (startupPreset.length)
        applyLookByName(startupPreset);
})();
