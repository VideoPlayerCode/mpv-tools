-- -----------------------------------------------------------
--
-- MULTI-COMMAND-IF.LUA
-- Short Name: MCIF (Multi-Command If)
-- Version: 1.0
-- Author: SteveJobzniak
-- URL: https://github.com/SteveJobzniak/mpv-tools
--
-- Description:
--
--  Very powerful conditional logic and multiple
--  action engine for your keybindings, without
--  having to write a single line of code!
--
-- -----------------------------------------------------------
--
-- A FAIR BUT MINOR USAGE WARNING:
--  It's *your* job to carefully type each argument
--  string perfectly. Any misformatted arguments will
--  lead to that condition or action being SKIPPED.
--  But you'll quickly get used to the MCIF syntax!
--  Examples of bad formatting to watch out for:
--  * Condition:
--    Bad: "((fullscreen=='yes))"
--          (missing the final ' apostrophe after yes)
--    Good: "((fullscreen=='yes'))"
--  * Action:
--    Bad: "{{=ontop:yes}}" (missing the final
--      colon : value separator after yes)
--    Good: "{{=ontop:yes:}}"
--  For those curious:
--   - Dual separators were needed to avoid clashing with mpv's
--     nested property expansion string format.
--   - The condition format is intentionally different from
--     actions to avoid confusion about which section is which
--     when you are reading long lines in your input.conf.
--
-- -----------------------------------------------------------
--
-- Parameters:
-- * conditions = Determines which set of actions will be performed.
-- * if_actions = Action string performed if ALL conditions are TRUE.
-- * else_actions = Action string performed if ANY conditions are FALSE.
--
--  See in-code documentation below for proper "conditions"
--  and "actions" string formats and possibilitions
--
--  And see the bottom of this file for usage examples to get you started.
--
function multi_command_if(conditions, if_actions, else_actions)
    --
    -- Check all conditions and choose the if_actions if ALL conditions
    -- are TRUE, or choose the else_actions if ANY of them are FALSE.
    -- This lets you decide whether or not your actions should run.
    -- You can have an unlimited amount of conditions.
    --
    -- Can be left as empty string (or one simply lacking conditions,
    -- such as "(())" which looks nicer), to completely avoid having
    -- any conditions! In that case, the "if_actions" will be chosen!
    -- That feature can be useful if you just want to enjoy the
    -- powerful action-sequencing capabilities of this script,
    -- and the various nice shorthand notations it gives you!
    --
    -- * "conditions" parameter string format example:
    -- "((fullscreen=='no'))((ontop~='yes'))((window-scale<<'1'))"
    --
    -- Each property is any property name as defined in mpv.
    --
    -- There is no need to worry about special characters such as ' apostrophe
    --  inside your value sections: "((someproperty=='It's raining'))".
    --  The "condition" pattern is "((<condition property name, which is
    --  everything up until 2 characters before the first ' apostrophe>
    --  <2-character comparison operator>'<value to compare against,
    --  which can contain apostrophes>'))". The only special sequence in the
    --  <comparison value> is "'))" which ends the condition pattern. So as
    --  long as you avoid that in your strings, you will be happy.
    --
    -- Comparison operators (each operator is 2 characters long):
    --   == equals                 (Lua equivalent: "==")
    --   ~= not equal              (Lua equivalent: "~=")
    --   << less than              (Lua equivalent: "<")    [ONLY FOR NUMBERS]
    --   <= less than or equals    (Lua equivalent: "<=")   [ONLY FOR NUMBERS]
    --   >> greater than           (Lua equivalent: ">")    [ONLY FOR NUMBERS]
    --   >= greater than or equals (Lua equivalent: ">=")   [ONLY FOR NUMBERS]
    --
    local actions = nil
    if (conditions == nil or conditions == "" or conditions == "(())") then
        -- No conditions: Choose if-actions immediately.
        actions = if_actions
    else -- Determine which actions to use.
        -- The parameter string format example would split into:
        -- fullscreen     ==    no
        -- ontop          ~=    yes
        -- window-scale   <<    1
        local conditionFailed = false
        for propName,propComparisonMethod,propCompareValue in string.gmatch(conditions, "%(%(([^']-)(..)'(.-)'%)%)") do
            -- Retrieve the current mpv property value as string for comparison.
            local propCurrentValue,err = mp.get_property(propName, nil)
            if (propCurrentValue == nil) then
                mp.msg.log("info", "No such conditional property '"..propName.."': "..tostring(err))
                mp.osd_message("No such conditional property '"..propName.."': "..tostring(err))
                return nil -- abort
            end
            -- Perform the requested method of comparison.
            -- NOTE: We cannot compare strings with numbers or vice versa, and
            -- we cannot check greater/less than for numbers if we don't treat
            -- them as numbers. So we need to determine the common value type
            -- and do either a numeric or string comparison. As for booleans
            -- "true" and "false", we will compare those as strings. And nil
            -- will be compared as the string "nil". If the values weren't both
            -- convertible to numbers or both to strings, then we consider the
            -- values to be of mixed types, which cannot be numerically compared
            -- in Lua. But ANY value (even tables and function references) CAN
            -- be converted to a string so the "mixed" scenario should never be
            -- able to happen. It is just there as a safeguard against exceptions.
            local aN = tonumber(propCurrentValue)
            local bN = tonumber(propCompareValue)
            local aS = tostring(propCurrentValue) -- these handle bool and nil too.
            local bS = tostring(propCompareValue) -- in fact, they handle ANY value.
            local areNumbers = ((aN ~= nil and bN ~= nil) and true or false)
            local areStrings = ((not areNumbers and aS ~= nil and bS ~= nil) and true or false)
            local areMixed = ((not areNumbers and not areStrings) and true or false)
            conditionFailed = true
            if (propComparisonMethod == "==") then -- equals
                if ((areNumbers and aN == bN) or (areStrings and aS == bS)) then
                    conditionFailed = false
                end
            elseif (propComparisonMethod == "~=") then -- not equal
                if ((areNumbers and aN ~= bN) or (areStrings and aS ~= bS) or (areMixed)) then
                    conditionFailed = false
                end
            elseif (propComparisonMethod == "<<") then -- less than
                if (areNumbers and aN < bN) then -- numeric-only operator
                    conditionFailed = false
                end
            elseif (propComparisonMethod == "<=") then -- less than or equals
                if (areNumbers and aN <= bN) then -- numeric-only operator
                    conditionFailed = false
                end
            elseif (propComparisonMethod == ">>") then -- greater than
                if (areNumbers and aN > bN) then -- numeric-only operator
                    conditionFailed = false
                end
            elseif (propComparisonMethod == ">=") then -- greater than or equals
                if (areNumbers and aN >= bN) then -- numeric-only operator
                    conditionFailed = false
                end
            else
                mp.msg.log("info", "Invalid conditional operator '"..propComparisonMethod.."'")
                mp.osd_message("Invalid conditional operator '"..propComparisonMethod.."'")
                return nil -- abort
            end
            -- Skip further scanning and choose the else_actions if the condition failed.
            if (conditionFailed) then
                actions = else_actions
                break -- no need to check further conditions
            end
        end
        -- End of loop: If the LAST condition succeeded then ALL of them succeeded,
        -- since we would have quit above as soon as any of them failed. So in this
        -- case, choose the if_actions since ALL conditions succeeded.
        if (not conditionFailed) then
            actions = if_actions
        end
    end

    --
    -- Perform all actions, but abort instantly if ANY of the actions fail.
    -- You can have an unlimited amount of actions.
    --
    -- Can be left as empty string to avoid having any actions (useful if you
    --  don't want any actions in either the "if" or "else" action-strings).
    --
    -- * "actions" parameter string format example:
    -- "{{=ontop:yes:}}{{!multiply:speed|1.25:}}{{$show-text:Speed? It's now: $${speed}.:}}{{@Quick_Scale:1680|1050|0.9|1:}}"
    --
    -- As you can see from the show-text example, there is no need to worry
    --  about special characters such as colon inside your value sections:
    --  "{{$show-text:Speed? It's now: $${speed}.:}}". The "action" pattern is
    --  "{{<1-character action type><action target name, which is everything up
    --  until the first colon>:<a target value which can contain colons>:}}".
    --  The only special sequences in the <target value> are "|" which separates
    --  multiple arguments, and ":}}" which ends the action pattern. So as long
    --  as you avoid those two in your strings, you will be happy.
    --
    -- Note the double $$ next to $${speed} in the example. That's to prevent
    --  mpv's property expansion from taking place in the keybinding. Otherwise,
    --  all ${...} sequences would be expanded AT the MOMENT you press the key,
    --  instead of during the processing of the action string, so you would see
    --  outdated values for the property (which you MAY not want). Adding an extra
    --  $$ sign makes the keybinding expand it to "$" so that WE can do the expansion
    --  of the most recent "${speed}" value during OUR action processing. Another
    --  alternative way to avoid early expansion is to globally turn it off for
    --  that whole keybinding by prefixing the binding with the word "raw", as in:
    --    "Alt+d raw script-message Multi_Command_If "Now you can ${...} expand later without needing $$.""
    --
    -- Action type operators (each operator is 1 character long):
    --   =  set a property
    --   !  execute a command (without doing property expansion)
    --   $  execute a command (with ${property} expansion, see note above for tips)
    --   @  execute a script-message command with property expansion (it's an
    --        alias for "{{$script-message:Target_Name|Arg1|Arg2...:}}")
    --
    -- The command or script message arguments are separated by |.
    -- There is no way to escape that character or make it more unique, because
    --  Lua sucks at splitting strings by anything more than a single character,
    --  BUT this character is non-existent in all commands I've ever seen!
    --
    -- Also be aware that the ":}}" character sequence marks the end of an action,
    --  but there should be no reason for you to ever have that within a string.
    --  And for those curious: We end with ":}}" to support mpv's nested expansions,
    --  which may contain multiple brackets, so the ":}}" sequence makes ours unique.
    --  PS: It also looks like a very happy guy. :}}
    --
    if (actions ~= nil and actions ~= "") then
        -- The parameter string format example would split into:
        -- =    ontop          yes
        -- !    multiply       speed|1.25
        -- $    show-text      Speed? It's now ${speed}.
        -- @    Quick_Scale    1680|1050|0.9|1
        for actionType,targetName,targetValue in string.gmatch(actions, "{{(.)([^:]-):(.-):}}") do
            -- Pre-processing to translate the "@" ("script-message") action shorthand.
            if (actionType == "@") then
                actionType = "$" -- "execute command with property expansion"
                targetValue = targetName.."|"..targetValue
                targetName = "script-message"
            end
            -- Pre-processing to translate the "$" action type to expand-properties.
            if (actionType == "$") then
                actionType = "!" -- "execute mpv command"
                targetValue = targetName.."|"..targetValue
                targetName = "expand-properties"
            end
            -- Process the user's action.
            if (actionType == "=") then
                -- Set mpv property value.
                local result,err = mp.set_property(targetName, targetValue)
                if (result == nil) then
                    mp.msg.log("info", "Error while setting property '"..targetName.."': "..tostring(err))
                    mp.osd_message("Error while setting property '"..targetName.."': "..tostring(err))
                    return nil -- abort
                end
            elseif (actionType == "!") then
                -- Execute mpv command (list: https://github.com/mpv-player/mpv/blob/master/DOCS/man/input.rst).
                -- We must first build the command arguments in the expected table format.
                local allArgs = {}
                allArgs[1] = targetName
                local currentArgNum = 2
                for token in string.gmatch(targetValue, "[^|]+") do
                    allArgs[currentArgNum] = token
                    currentArgNum = currentArgNum + 1
                end
                -- Dispatch the command.
                -- NOTE: In the case of "script-message" there is NO way to check the
                --  return code of the function(s) that may have handled the message!
                local result,err = mp.command_native(allArgs, nil)
                if (err ~= nil) then
                    mp.msg.log("info", "Error while calling '"..targetName.."': "..tostring(err))
                    mp.osd_message("Error while calling '"..targetName.."': "..tostring(err))
                    return nil -- abort
                end
            else
                mp.msg.log("info", "Invalid action type operator '"..actionType.."'")
                mp.osd_message("Invalid action type operator '"..actionType.."'")
                return nil -- abort
            end
        end
    end
end

--
-- Bind this via input.conf.
--
-- Examples:
--
-- * Very simple "Hello world" example which shows different messages depending
--   on whether you are in fullscreen mode or not:
--
--   Alt+d script-message Multi_Command_If "((fullscreen=='yes'))" "{{!show-text:Hello World in Fullscreen!:}}" "{{!show-text:Not in Fullscreen!:}}"
--
-- * Showing that you can use numeric comparison operators, and that you don't
--   have to provide any "else"-actions. This only scales the video to 100% if
--   the scale is less than 100%. Does nothing if already at 100% or greater:
--
--   Alt+d script-message Multi_Command_If "((window-scale<<'1'))" "{{=window-scale:1:}}{{!show-text:Resetting tiny window to 100% scale.:}}"
--
-- * Shows "Enhance!" when the actions are executed. But if the condition fails
--   it simply shows "Can't resize in fullscreen!":
--
--   Alt+d script-message Multi_Command_If "((fullscreen~='yes'))" "{{=ontop:yes:}}{{!multiply:window-scale|1.1:}}{{!show-text:Enhance!:}}" "{{!show-text:Can't resize in fullscreen!:}}"
--
-- * Lastly, an example of requiring multiple conditions:
--
--   Alt+d script-message Multi_Command_If "((ontop=='yes'))((fullscreen=='no'))" "{{!show-text:Always on top, and not in fullscreen.:}}"
--
mp.register_script_message("Multi_Command_If", multi_command_if)
