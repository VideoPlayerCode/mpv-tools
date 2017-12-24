/*
 * OPTIONS.JS (MODULE)
 *
 * Description: JavaScript implementation of mpv's Lua API's config file system,
 *              via "mp.options.read_options()". See official Lua docs for help.
 *              https://github.com/mpv-player/mpv/blob/master/DOCS/man/lua.rst#mpoptions-functions
 * Version:     2.0.0
 * Author:      SteveJobzniak
 * URL:         https://github.com/SteveJobzniak/mpv-tools
 * License:     Apache License, Version 2.0
 */

/* jshint -W097 */
/* global mp, exports, require */

'use strict';

var ScriptConfig = function(options, identifier)
{
    if (!options)
        throw 'Options table parameter is missing.';
    this.options = options;
    this.scriptName = typeof identifier === 'string' ? identifier : mp.get_script_name();
    this.configFile = null;

    // Converts string "val" to same primitive type as "destTypeVal".
    var typeConv = function(destTypeVal, val)
    {
        switch (typeof destTypeVal) {
        case 'string':
            if (typeof val !== 'string')
                val = String(val);
            break;
        case 'boolean':
            if (val === 'yes')
                val = true;
            else if (val === 'no')
                val = false;
            else {
                mp.msg.error('Error: Can\'t convert '+JSON.stringify(val)+' to boolean!');
                val = undefined;
            }
            break;
        case 'number':
            var num = parseFloat(val);
            if (!isNaN(num))
                val = num;
            else {
                mp.msg.error('Error: Can\'t convert '+JSON.stringify(val)+' to number!');
                val = undefined;
            }
            break;
        default:
            val = undefined;
        }
        return val;
    };

    // Find config file.
    if (this.scriptName && this.scriptName.length) {
        mp.msg.debug('Reading options for '+this.scriptName+'.');
        this.configFile = mp.find_config_file('script-settings/'+this.scriptName+'.conf');
        if (!this.configFile) // Try legacy settings location as fallback.
            this.configFile = mp.find_config_file('lua-settings/'+this.scriptName+'.conf');
    }

    // Read and parse configuration if found.
    var i, len, pos, key, val, convVal;
    if (this.configFile && this.configFile.length) {
        try {
            var line, configLines = mp.utils.read_file(this.configFile).split(/[\r\n]+/);
            for (i = 0, len = configLines.length; i < len; ++i) {
                line = configLines[i].replace(/^\s+/, '');
                if (!line.length || line.charAt(0) === '#')
                    continue;
                pos = line.indexOf('=');
                if (pos < 0) {
                    mp.msg.warn('"'+this.configFile+'": Ignoring malformatted config line "'+line.replace(/\s+$/, '')+'".');
                    continue;
                }
                key = line.substring(0, pos);
                val = line.substring(pos + 1);
                if (this.options.hasOwnProperty(key)) {
                    convVal = typeConv(this.options[key], val);
                    if (typeof convVal !== 'undefined')
                        this.options[key] = convVal;
                    else
                        mp.msg.error('"'+this.configFile+'": Unable to convert value "'+val+'" for key "'+key+'".');
                }
                else
                    mp.msg.warn('"'+this.configFile+'": Ignoring unknown key "'+key+'".');
            }
        } catch (e) {
            mp.msg.error('Unable to read configuration file "'+this.configFile+'".');
        }
    }
    else
        mp.msg.verbose('Unable to find configuration file for '+this.scriptName+'.');

    // Parse command-line options.
    if (this.scriptName && this.scriptName.length) {
        var cmdOpts = mp.get_property_native('options/script-opts'), rawOpt,
            prefix = this.scriptName+'-';
        len = prefix.length;
        for (rawOpt in cmdOpts) {
            if (!cmdOpts.hasOwnProperty(rawOpt))
                continue;
            pos = rawOpt.indexOf(prefix);
            if (pos !== 0)
                continue;
            key = rawOpt.substring(len);
            if (key.length && this.options.hasOwnProperty(key)) {
                val = cmdOpts[rawOpt];
                convVal = typeConv(this.options[key], val);
                if (typeof convVal !== 'undefined')
                    this.options[key] = convVal;
                else
                    mp.msg.error('script-opts: Unable to convert value "'+val+'" for key "'+key+'".');
            }
            else
                mp.msg.warn('script-opts: Ignoring unknown key "'+key+'".');
        }
    }
};

ScriptConfig.prototype.getValue = function(key)
{
    if (!this.options.hasOwnProperty(key))
        throw 'Invalid option "'+key+'"';
    return this.options[key];
};

ScriptConfig.prototype.getMultiValue = function(key)
{
    // Multi-value format: `{one}+{two}+{three}`.
    var i, len,
        val = this.getValue(key), // Throws.
        result = [];
    if (typeof val !== 'string')
        throw 'Invalid non-string value in multi-value option "'+key+'"';
    len = val.length;
    if (len) {
        if (val.charAt(0) !== '{' || val.charAt(len - 1) !== '}')
            throw 'Missing surrounding "{}" brackets in multi-value option "'+key+'"';
        val = val.substring(1, len - 1).split('}+{');
        len = val.length;
        for (i = 0; i < len; ++i) {
            result.push(val[i]);
        }
    }
    return result;
};

// Class `advanced_options()`: Offers extended features such as multi-values.
exports.advanced_options = ScriptConfig;

// Function `read_options()`: Behaves like Lua API (returns plain list of opts).
exports.read_options = function(table, identifier) {
    // NOTE: "table" will be modified by reference, just as the Lua version.
    var config = new ScriptConfig(table, identifier);
    return config.options; // This is the same object as "table".
};
