/*
 * BACKBOX.JS
 * Description: Advanced, modular media browser and file manager for mpv.
 * Version: 1.0
 * Author: SteveJobzniak
 * URL: https://github.com/SteveJobzniak/mpv-tools
 * License: Apache License, Version 2.0
 */

// Read the bottom of this file for configuration and script setup instructions.

/* jshint -W097 */
/* global mp, require */

'use strict';

var ScriptConfig = require('ScriptConfig'),
    Utils = require('MicroUtils'),
    Ass = require('AssFormat'),
    PathIndex = require('PathIndex'),
    PathTools = require('PathTools'),
    PlaylistManager = require('PlaylistManager'),
    SelectionMenu = require('SelectionMenu');

var Backbox = function(options)
{
    options = options || {};

    // List of system folders to ignore, keyed by parent path.
    this.ignorePaths = {
        '/': {
            // General Linux system paths (some are used by macOS too).
            'bin':1,
            'boot':1,
            'cdrom':1,
            'dev':1,
            'etc':1,
            'lib':1,
            'lib32':1,
            'lib64':1,
            'lost+found':1,
            'opt':1,
            'proc':1,
            'root':1,
            'run':1,
            'sbin':1,
            'selinux':1,
            'snap':1,
            'srv':1,
            'sys':1,
            'tmp':1,
            'usr':1,
            'var':1,
            // Useless macOS-specific system paths.
            'cores':1,
            'net':1,
            'private':1,
            'Library':1, // System data and preference library (useless).
            'System':1 // Operating system (useless).
        }
    };
    if (PathTools.isMac()) // Ignore "/home" on macOS (but not on Unix/Linux).
        this.ignorePaths['/'].home = 1;

    // Media file detection regex (pre-compiled since MuJS regexps are slow).
    this.mediaRgx = /\.(?:mp[234]|m4[av]|mpe?g|m[12]v|web[mp]|mk(?:[av]|3d)|h?264|qt|mov|avi|xvid|divx|wm[av]|asf|pcm|flac|aiff|wav|aac|dts|e?ac3|dat|bin|vob|vcd|mt[sv]|m2ts?|ts|flv|f4[vp]|rm(?:vb)?|3(?:gp|iv)|h?dv|og[gmv]|jpe?g|png|bmp|gif)$/i;

    // Active file browser path.
    this.currentPath = null;

    // Favorite media paths and/or files.
    this.favoritePaths = [];

    // Initialize the navigation menu and its callbacks.
    this.currentPage = null;
    this.currentPageIdx = -1;
    this.pageList = ['files', 'favorites'];
    this.lastPageSelection = {}; // Tracks last-used selection on each page.
    this.currentlyPlayingStr = '[Currently Playing]';
    this.showHelpHint = typeof options.showHelpHint === 'boolean' ?
        options.showHelpHint : true;
    this.menu = new SelectionMenu({ // Throws if bindings are illegal.
        maxLines: options.maxLines,
        menuFontSize: options.menuFontSize,
        autoCloseDelay: options.autoCloseDelay,
        keyRebindings: options.keyRebindings
    });
    this.menu.setMetadata({type:null});
    this.lastNavTime = 0;
    this._registerCallbacks();

    // Only use menu text colors while mpv is rendering in GUI mode (non-CLI).
    var self = this;
    this.menu.setUseTextColors(mp.get_property_bool('vo-configured'));
    mp.observe_property('vo-configured', 'bool', function(name, value) {
        self.menu.setUseTextColors(value);
    });

    // Register all of the favorite paths/files in this media browser instance.
    var favOpt = options.favoritePaths;
    if (favOpt && favOpt.length) {
        try {
            for (var i = 0; i < favOpt.length; ++i) {
                this.addFavorite(favOpt[i]); // Throws.
            }
        } catch (e) { // Treat as non-fatal.
            this._showError('Backbox: Invalid favorites option value: '+e+'.', 3);
        }
    }
};

Backbox.prototype.flipPage = function(forcePage)
{
    if (forcePage === this.currentPage || (forcePage === 'none' && this.currentPage === null))
        return; // No-op: We're already marked as being on that exact page!

    // Save state from the currently active page (if any).
    switch (this.currentPage) {
    case 'files':
    case 'favorites':
        // Be sure that we only save the selection if the menu CONTAINS data for
        // the page that we're "leaving". It may have simply failed to swap page
        // (loading the "currentPage" data) and now swapping back to old page!
        if (this.menu.getMetadata().type === this.currentPage)
            this.lastPageSelection[this.currentPage] = this.menu.getSelectedItem();
        break;
    }

    // Cycle to the next (or target) page index.
    if (typeof forcePage === 'string') {
        var forceIdx = -1;
        for (var i = 0; i < this.pageList.length; ++i)
            if (this.pageList[i] === forcePage) {
                forceIdx = i;
                break;
            }
        this.currentPageIdx = forceIdx;
    }
    else
        ++this.currentPageIdx;

    // Verify the page index and activate the page.
    if (this.currentPageIdx >= 0 && this.currentPageIdx < this.pageList.length)
        this.currentPage = this.pageList[this.currentPageIdx];
    else {
        this.currentPage = null;
        this.currentPageIdx = -1;
    }
};

Backbox.prototype.addFavorite = function(path)
{
    // Do some basic validation, but don't check for duplicates or path
    // existence (we could verify that by trying to read the path, but people
    // may want to include paths/files that are not always available).
    var pathSep = PathTools.pathSep(),
        pl = path.length;
    if (!pl)
        throw 'Empty path';
    if (pl > 1 && path.charAt(pl - 1) === pathSep) // Allows "/" (root).
        throw 'Trailing "'+pathSep+'" in path "'+path+'"';

    this.favoritePaths.push(path);
};

Backbox.prototype._showError = function(err, durationSec)
{
    err = typeof err === 'string' ? err : '_showError: No error string.';
    durationSec = typeof durationSec === 'number' ? durationSec : 2;
    if (durationSec < 1)
        durationSec = 1;

    mp.msg.error(err);
    if (this.menu.isMenuActive())
        this.menu.showMessage(err, Math.ceil(durationSec * 1000));
    else
        mp.osd_message(err, durationSec);
};

Backbox.prototype._registerCallbacks = function()
{
    var browser = this;
    // browser.menu.setCallbackMenuShow(function() {});
    browser.menu.setCallbackMenuHide(function() {
        browser.flipPage('none'); // Force-flip in case menu was closed via timeout.
    });
    browser.menu.setCallbackMenuLeft(function() {
        if (browser.currentPage !== 'files')
            return;

        // Throttle navigation speed to avoid blazing backwards.
        var newNavTime = mp.get_time_ms();
        if (newNavTime - browser.lastNavTime < 200) // 0.2s
            return;

        // Navigate to parent folder, but no higher than drive root.
        var parentPath = PathTools.getParentPath(browser.currentPath);

        // Only reindex folder if path is new, otherwise just render.
        if (parentPath.newPath !== browser.currentPath)
            // NOTE: If parent dir is deleted/unreadable, this shows an error:
            browser.navigateDir(
                parentPath.newPath,
                // Select the directory we've just left, for easy navigation.
                parentPath.previousDir ? parentPath.previousDir+'/' : null
            );
        else
            browser.menu.renderMenu();

        // Update navigation throttling timestamp.
        browser.lastNavTime = newNavTime;
    });
    var processSelection = function() {
        var selection = browser.getSelection();
        if (!selection.targetPath)
            return null; // Abort since there is no selection.

        var targetPath = selection.targetPath,
            selectEntry = null;

        switch (selection.menuPage) {
        case 'favorites':
            if (targetPath === browser.currentlyPlayingStr) {
                var playingFile = PlaylistManager.getCurrentlyPlayingLocal(true);
                if (playingFile.pathName) {
                    targetPath = playingFile.pathName;
                    if (playingFile.baseName)
                        // Select currently playing file when navigating to dir.
                        selectEntry = playingFile.baseName;
                } else {
                    browser.menu.showMessage('No local file is playing.');
                    return null;
                }
            }
            break;
        case 'files':
            break;
        default:
            return null; // Unknown page.
        }

        // It's important that we check for existence. Favorites in particular
        // may contain unavailable favorite locations (such as network shares),
        // but folders can also contain stale file lists that were indexed
        // before something in the directory was deleted or modified.
        // NOTE: The reason why there's no dedicated "refresh folder" action
        // is because it's easy to press "left + right" to re-open a dir.
        var targetType = PathTools.getPathInfo(targetPath);
        if (targetType === 'missing') {
            mp.msg.error('Backbox: Unable to access "'+targetPath+'".');
            browser._showError(
                // Since it's missing, we'll have to guess the type. Only the
                // files-page will be able to guess that things are files...
                // The favorites-page assumes everything missing is a folder!
                'Backbox: '+(selection.itemType === 'file' ? 'File' : 'Target')+
                    ' is missing or unreadable.'+
                    (selection.menuPage === 'files' ? ' Re-indexing directory...' : ''),
                0.8
            );
            if (selection.menuPage === 'files') {
                // NOTE: If the WHOLE dir is missing, this shows an error:
                browser.navigateDir(browser.currentPath, null, true); // Force re-index.
            }
            return null;
        }

        // The target exists and has been successfully analyzed.
        return {
            targetType: targetType,
            targetPath: targetPath,
            selectEntry: selectEntry
        };
    };
    browser.menu.setCallbackMenuRight(function() {
        var selection = processSelection();
        if (!selection)
            return;

        switch (selection.targetType) {
        case 'dir':
            // Navigate into the directory. Huge dirs might take a few seconds.
            browser.menu.renderMenu('[loading...]'); // Show a selection prefix.
            browser.navigateDir(
                selection.targetPath,
                selection.selectEntry, // Filename to select, or null.
                selection.selectEntry !== null // Force refresh if selection.
            );

            // Update navigation throttling timestamp, with a slight reduction
            // since we've just entered this folder and may wanna leave it fast.
            browser.lastNavTime = mp.get_time_ms() - 50;
            break;
        case 'file':
            // Refuse to double-queue the last playlist item.
            var lastItem = PlaylistManager.getPlaylist(-1);
            if (lastItem && !PathTools.isWebURL(lastItem.filename) &&
                selection.targetPath === PathTools.makePathAbsolute(lastItem.filename)) {
                browser.menu.renderMenu('[already queued]');
                return;
            }

            // Add the file to the playlist queue and show OSD hint.
            mp.commandv('loadfile', selection.targetPath, 'append-play');
            browser.menu.renderMenu('[added to playlist!]');
            break;
        default:
            mp.msg.error('Unknown selection type: '+selection.targetType);
        }
    });
    browser.menu.setCallbackMenuOpen(function() {
        var selection = processSelection();
        if (!selection)
            return;

        // We absolutely MUST place the player into "idle if there is no
        // file to play" mode! Otherwise it will QUIT now if dir/file is empty!
        mp.set_property('idle', 'yes');
        // Replace whole playlist with selected file or folder (recursively).
        // NOTE: Recursively loading a folder is a non-blocking function call
        // but may freeze the player while mpv scans for files in large trees!
        mp.commandv('loadfile', selection.targetPath, 'replace');
        browser.menu.hideMenu();

        // Show feedback to tell the user what is being queued...
        var c = browser.menu.useTextColors,
            osdText = Ass.startSeq(c)+Ass.scale(90, c)+
                'Queueing media file'+(selection.targetType === 'dir' ? 's' : ''),
            baseName = PathTools.getBasename(selection.targetPath); // Name of dir/file.
        if (baseName)
            osdText += (selection.targetType === 'dir' ? ' in' : '')+':\n'+
                Ass.scale(60, c)+Ass.yellow(c)+'"'+Ass.esc(baseName, c)+'"';
        else
            osdText += '...';
        osdText += Ass.stopSeq(c);
        mp.osd_message(osdText, 2); // Regular OSD message due to hiding menu.
    });
    browser.menu.setCallbackMenuUndo(function() {
        // Remove the last playlist item (regardless of who/what added it).
        var playlistCount = mp.get_property_number('playlist-count');
        if (playlistCount > 1) {
            var lastItem = PlaylistManager.getPlaylist(-1);

            // Refuse to remove the currently playing item (would quit mpv).
            if (lastItem && lastItem.current) {
                browser.menu.showMessage('Cannot remove the currently playing playlist item.');
                return;
            }

            mp.commandv('playlist-remove', playlistCount - 1);

            // Show the basename and playlist-pos of the file that was removed.
            var c = browser.menu.useTextColors,
                lastFilename = lastItem ? PathTools.getBasename(lastItem.filename) : '',
                clearSelectionPrefix = false;
            if (lastItem && !PathTools.isWebURL(lastItem.filename)) {
                var lastFullPath = PathTools.makePathAbsolute(lastItem.filename);
                if (lastFullPath === browser.getSelection().targetPath)
                    // Exact playlist path matches the selected file.
                    clearSelectionPrefix = true;
            }
            browser.menu.showMessage(
                'Removed #'+playlistCount+' from playlist'+
                    (!lastFilename.length ? '.' : ':\n'+Ass.startSeq(c)+Ass.yellow(c)+
                     '"'+Ass.esc(lastFilename, c)+'"'+Ass.stopSeq(c)),
                1500, // Show msg for 1.5s to prevent accidental mass-deletions.
                clearSelectionPrefix // Removes menu prefix of de-queued file.
            );
        } else {
            // Don't remove the only remaining playlist item (would quit mpv).
            browser.menu.showMessage('Cannot remove the only remaining playlist item.');
        }
    });
};

Backbox.prototype._generateLegalPath = function(path)
{
    var overrideSelect = false;
    if (typeof path !== 'string') // Re-use current if no new path provided.
        path = this.currentPath; // NOTE: Is null if no path navigated yet.
    if (typeof path !== 'string' || !path.length) {
        overrideSelect = true;

        // Grab current local playlist file (if any) and make its path absolute.
        var playingFile = PlaylistManager.getCurrentlyPlayingLocal(true);

        // Mark the media filename for selection, to auto-select the currently
        // playing local file the 1st time user opens the browser.
        if (playingFile.pathName) {
            path = playingFile.pathName;
            if (playingFile.baseName)
                overrideSelect = playingFile.baseName;
        }
    }
    if (typeof path !== 'string' || !path.length) {
        if (overrideSelect === false) // Only toggle if no name-override exists.
            overrideSelect = true;

        // As a last resort, begin navigation in mpv's current working
        // directory. This is necessary if there was no playlist, or if the
        // current file was a web URL, or if it was a relative file which
        // isn't within any subfolder of the working dir.
        path = PathTools.getCwd(true); // Throws.
    }

    return {
        path: path,
        overrideSelect: overrideSelect
    };
};

Backbox.prototype.getSelection = function()
{
    var selection = {
        menuPage: this.currentPage,
        item: null,
        itemType: null,
        targetPath: null
    };

    var menuMetadata = this.menu.getMetadata();
    if (!menuMetadata || menuMetadata.type !== selection.menuPage)
        selection.menuPage = null; // Menu does not have data for this page.

    if (selection.menuPage === null)
        return selection;

    var selectedItem = this.menu.getSelectedItem();

    // Handle the selection as a favorites-page item.
    if (selection.menuPage === 'favorites') {
        selection.item = selectedItem;
        selection.itemType = 'favorite';
        selection.targetPath = selection.item !== this.currentlyPlayingStr ?
            PathTools.makePathAbsolute(selection.item) : selection.item;
        return selection;
    }

    // Handle the selection as a files-page item and detect type from its name.
    var isDir = selectedItem.substring(selectedItem.length - 1) === '/';
    if (isDir)
        selectedItem = selectedItem.substring(0, selectedItem.length - 1);
    selection.item = selectedItem;
    selection.itemType = isDir ? 'dir' : 'file';

    if (selectedItem.length)
        selection.targetPath = PathTools.getSubPath(this.currentPath, selectedItem);

    return selection;
};

Backbox.prototype.navigateFav = function(selectEntry)
{
    this.flipPage('favorites'); // Force flip to save old state.

    // Only build the menu options if we aren't already viewing that data.
    if (this.menu.getMetadata().type !== 'favorites') {
        var i, fav,
            menuOptions = [],
            initialSelectionIdx = 0;

        menuOptions.push(this.currentlyPlayingStr);
        if (selectEntry !== this.currentlyPlayingStr)
            ++initialSelectionIdx; // Start at 2nd item (after "current").

        for (i = 0; i < this.favoritePaths.length; ++i) {
            fav = this.favoritePaths[i];
            menuOptions.push(fav);
            if (selectEntry === fav)
                initialSelectionIdx = menuOptions.length - 1;
        }

        this.menu.getMetadata().type = 'favorites';
        this.menu.setTitle((menuOptions.length === 0 ? '[empty] ' : '')+'Backbox Favorites');
        this.menu.setOptions(menuOptions, initialSelectionIdx);
    }

    this.menu.renderMenu();
};

Backbox.prototype.navigateDir = function(path, selectEntry, forceRefresh)
{
    var oldPage = this.currentPage;
    this.flipPage('files'); // Force flip to save old state.

    try {
        // Transform the incoming path (uses playlist path or cwd if no path).
        var legalPathInfo = this._generateLegalPath(path); // Throws if cwdfail.
        path = legalPathInfo.path;

        // The transformation may have picked a different path and told us which
        // filename to select in that case, since we obviously can't use
        // "selectEntry" if the path has been changed by the transformation.
        // NOTE: The only real case where this happens is during the first
        // browsing, where either the current playlist item's path or cwd is
        // chosen as the startpoint. It tries to select the playing filename.
        if (legalPathInfo.overrideSelect !== false)
            selectEntry = typeof legalPathInfo.overrideSelect === 'string' ?
                legalPathInfo.overrideSelect : null;

        // NOTE: If the last-assigned menu data was "files" and the path has not
        // changed, we don't waste time reindexing since it's already loaded,
        // and the user's last selection is already active (no need to restore).
        if (forceRefresh || this.menu.getMetadata().type !== 'files' || this.currentPath !== path) {
            var i, dir, file,
                dirContents = new PathIndex(path, { // Throws if bad path.
                    skipDotfiles: true,
                    fileFilterRgx: this.mediaRgx // Show only media-ext files.
                }),
                ignorePaths = this.ignorePaths[path],
                menuOptions = [],
                initialSelectionIdx = 0;

            for (i = 0; i < dirContents.dirs.length; ++i) {
                dir = dirContents.dirs[i];
                if (ignorePaths && ignorePaths[dir])
                    continue; // Hide (skip) this directory.
                dir += '/'; // Append slash to signify that it is a directory.
                menuOptions.push(dir);
                if (selectEntry === dir)
                    initialSelectionIdx = menuOptions.length - 1;
            }
            for (i = 0; i < dirContents.files.length; ++i) {
                file = dirContents.files[i];
                menuOptions.push(file);
                if (selectEntry === file)
                    initialSelectionIdx = menuOptions.length - 1;
            }

            var helpPrefix = '';
            if (this.showHelpHint && this.currentPath === null) { // 1st browse.
                var helpKeys = this.menu.keyBindings['Menu-Help'].keys;
                if (helpKeys.length)
                    helpPrefix = '['+helpKeys[0]+' for help] ';
            }

            this.currentPath = path;
            this.lastPageSelection.files = null; // Forget saved selection after path-change.
            this.menu.getMetadata().type = 'files';
            this.menu.setTitle(helpPrefix+(menuOptions.length === 0 ? '[empty] ' : '')+path);
            this.menu.setOptions(menuOptions, initialSelectionIdx);
        }

        this.menu.renderMenu();
    } catch (e) {
        // Restore the previous page (if different from current).
        // NOTE: If we're already in the filebrowser, path stays where it was!
        this.flipPage(oldPage);
        this._showError('Backbox: Unable to access directory "'+path+'".', 0.8);
    }
};

Backbox.prototype.switchMenu = function(forcePage)
{
    if (typeof forcePage === 'string') {
        // We're being asked to go to a specific page. Toggle if already there.
        if (forcePage === this.currentPage)
            forcePage = 'none';
        this.flipPage(forcePage);
    } else {
        // Flip to the next menu page.
        this.flipPage();
        // NOTE: The method below can be used for skipping past empty pages.
        // if (this.currentPage === 'favorites' && !this.favoritePaths.length)
        //     this.flipPage();
    }

    // Render the page, or hide menu if there were no more pages/toggled off.
    if (this.currentPage === null)
        this.menu.hideMenu();
    else {
        // Stop any lingering menu-message before swapping the page.
        this.menu.stopMessage();

        switch (this.currentPage) {
        case 'favorites':
            this.navigateFav(this.lastPageSelection.favorites);
            break;
        case 'files':
            this.navigateDir(this.currentPath, this.lastPageSelection.files);
            break;
        default:
            mp.msg.error('Unknown menu page: '+this.currentPage);
        }
    }
};

(function() {
    // Read user configuration (uses defaults for any unconfigured options).
    // * You can override these values via the configuration system, as follows:
    // - Via permanent file: `<mpv config dir>/script-settings/Backbox.conf`
    // - Command override: `mpv --script-opts=Backbox-favorites="{/path1}+{/path2}"`
    // - Or by editing this file directly (not recommended, makes your updates harder).
    var userConfig = new ScriptConfig({
        // How long to keep the menu open while you are idle.
        // * (float/int) Ex: `10` (ten seconds), `0` (to disable autoclose).
        auto_close: 5,
        // Maximum number of file selection lines to show at a time.
        // * (int) Ex: `20` (twenty lines). Cannot be lower than 3.
        max_lines: 10,
        // What font size to use for the menu text. Large sizes look the best.
        // * (int) Ex: `42` (font size fourtytwo). Cannot be lower than 1.
        font_size: 40,
        // Whether to show the "[h for help]" hint on the first launch.
        // * (bool) Ex: `yes` (enable) or `no` (disable).
        help_hint: true,
        // List of paths (and/or files) to show in the favorites menu, each delimited by `{}` and plus signs.
        // * (string) Ex: `{/home/foo}+{/mnt}+{/media}+{/bunny.avi}` to add three paths and a file.
        // - To get to your favorites, press the "Backbox" hotkey twice.
        favorites: '',
        // Keybindings. You can bind any action to multiple keys simultaneously.
        // * (string) Ex: `{up}`, `{up}+{shift+w}` or `{x}+{+}` (binds to "x" and the plus key).
        // - Note that all "shift variants" MUST be specified as "shift+<key>".
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

    // Create and initialize the media browser instance.
    try {
        var browser = new Backbox({ // Throws.
            autoCloseDelay: userConfig.getValue('auto_close'),
            maxLines: userConfig.getValue('max_lines'),
            menuFontSize: userConfig.getValue('font_size'),
            showHelpHint: userConfig.getValue('help_hint'),
            favoritePaths: userConfig.getMultiValue('favorites'),
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
    } catch (e) {
        mp.msg.error('Backbox: '+e+'.');
        mp.osd_message('Backbox: '+e+'.', 3);
        throw e; // Critical init error. Stop script execution.
    }

    // Provide the bindable mpv command which opens/cycles through the menu.
    // * Bind this via input.conf: `ctrl+b script-binding Backbox`.
    // - To get to your favorites (if you've added some), press this key twice.
    mp.add_key_binding(null, 'Backbox', function() {
        browser.switchMenu();
    });

    // Provide bindings that go directly to (or toggle off) each specific page.
    mp.add_key_binding(null, 'Backbox_Files', function() {
        browser.switchMenu('files');
    });
    mp.add_key_binding(null, 'Backbox_Favorites', function() {
        browser.switchMenu('favorites');
    });
})();
