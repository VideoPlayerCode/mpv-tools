-- -----------------------------------------------------------
--
-- AUTO-KEEP-GUI-OPEN.LUA
-- Version: 1.0
-- Author: SteveJobzniak
-- URL: https://github.com/SteveJobzniak/mpv-tools
--
-- Description:
--
--  Intelligently switches mpv's "keep-open" behavior based on
--  whether you are running in video-mode or audio-only mode.
--
-- -----------------------------------------------------------
--
-- Recommended configuration:
--  AKGO_WINDOW_KEEP_OPEN_VALUE="yes" (or "always")
--  AKGO_NOWINDOW_KEEP_OPEN_VALUE="no" (or "original")
--  AKGO_USE_WINDOW_FOR_AUDIO_AFTER_VIDEO=true
--
-- Result:
--  * If you manually queue up a bunch of audio-only files via your
--    command line, then you'll never see a GUI, so you'll always be in
--    the "NOWINDOW" state, which means that the player automatically
--    advances to the next audio file and quits when it reaches the end.
--  * It's only when you play a *video* file that the "WINDOW" state
--    happens, and thanks to the "USE_WINDOW" option mpv will then
--    automatically *stay* in the video/window state and use the
--    "AKGO_WINDOW_KEEP_OPEN_VALUE" for the rest of the playlist.
--  * This script therefore automatically gives you the best of both
--    worlds. Audio-only playlists started from the command line will
--    stay in CLI mode if started from CLI, but Video / Audio+Video
--    playlists (regardless of whether they were started from the
--    desktop via double-clicking or via the command line) will *stay*
--    in GUI mode and use the WINDOW keep-open value, which makes mpv
--    behave even better as a GUI application, without hurting CLI mode.
--
-- -----------------------------------------------------------
--
-- ### START OF USER CONFIGURATION:
--
-------
--
-- AKGO_WINDOW_KEEP_OPEN_VALUE:
-- Possible values are: "no", "yes", "always", "original".
-- Reference: https://mpv.io/manual/master/#options-keep-open
--
-- The "keep-open" option will be set to this value every time the video
-- output is created. Most video output modules create a GUI, so in
-- other words, this is the "keep-open" value that mpv will use when in
-- GUI mode with a video window on screen.
--
-- Note: The special value "original" means whatever was in your user
-- config before this script was loaded.
--
--
-- I recommend setting this option to "yes", so that mpv's GUI stays
-- open after you've reached the end of your playlist or scrubbed the
-- playback position to the end of the last file. This means that you
-- can safely scrub the playback without worrying that you'll hover near
-- the end and make mpv "insta-terminate" when you were just trying to
-- scrub the video position. It makes mpv behave much better as a GUI
-- application.
--
-- You may even want to set it to "always", to always pause after the
-- end of every playlist item (instead of just the last one), to give
-- you manual control over advancing your playlists. But to most people,
-- that isn't as important as simply ensuring that the player stays alive
-- after the end of the final file.
--
-- The benefit of using this script instead of setting the option
-- globally, is that it makes it easy to have one "keep-open" setting
-- for music and another for videos, without having to fiddle with
-- manual per-extension settings. This script is smarter than extension
-- filters, since we detect when video output is used, as opposed to
-- blindly guessing based on file extension. The dynamic switching of
-- this script means that you preserve the ability to use mpv from the
-- command line to play your music files without worrying about having
-- to manually advance every music playlist step by step if you had used
-- a global "keep-open" setting. And your mpv GUI will be much more
-- reliable for video playback as well, since you will prevent mpv from
-- accidentally quitting its GUI at the slightest accidental touch. ;-)
--
AKGO_WINDOW_KEEP_OPEN_VALUE="yes"
--
-------
--
-- AKGO_NOWINDOW_KEEP_OPEN_VALUE:
-- Possible values are: "no", "yes", "always", "original".
-- Reference: https://mpv.io/manual/master/#options-keep-open
--
-- The "keep-open" option will be set to this value every time the video
-- output is destroyed. If you want non-video files in your playlist
-- to be treated differently, then this is for you.
--
-- Note: The special value "original" means whatever was in your user
-- config before this script was loaded.
--
--
-- However, if you set AKGO_USE_WINDOW_FOR_AUDIO_AFTER_VIDEO to true,
-- then all audio files in the playlist (*after* a *video* has played)
-- will continue using the GUI, and this "NOWINDOW" state won't happen.
--
-- I recommend keeping this at "no" or "original" (which means "no" if
-- you haven't set any custom config value for "keep-open").
--
AKGO_NOWINDOW_KEEP_OPEN_VALUE="original"
--
-------
--
-- AKGO_USE_WINDOW_FOR_AUDIO_AFTER_VIDEO:
-- Possible values are: true, false.
-- Reference: https://mpv.io/manual/master/#options-force-window
--
-- If true, we will automatically enable "force-window" after mpv has
-- used video output at least once during the current playlist session.
--
--
-- For most people (who only play a single file) this won't do anything.
-- Nor for people who start mpv with "--player-operation-mode pseudo-gui"
-- since that already enables the video output for audio files too.
--
-- Instead, this option is for when you're *manually* queuing up
-- multiple files from the command line and some of them are video files
-- and some are audio files. Without this option, mpv would switch back
-- and forth between terminal output (CLI) for the playlist's audio
-- files, and video output (GUI) for its video files.
--
-- Automatically switching to force-window means we will use the GUI
-- even for the audio files.
--
-- I recommend leaving this option enabled.
--
AKGO_USE_WINDOW_FOR_AUDIO_AFTER_VIDEO=true
--
-------
--
-- ### END OF USER CONFIGURATION.
-- -----------------------------------------------------------

-- Only proceed if user's personal/system mpv config was loaded.
-- NOTE: This is just a safeguard to protect programs that use
-- mpv as their backend via "--no-config" mode. For now, that
-- actually prevents all user scripts from loading, but there's
-- no guarantee it will always be that way. Better safe than sorry.
if (mp.get_property("config") ~= "no") then
    local originalKeepOpenValue = mp.get_property("keep-open")

    -- This runs with "false" at mpv initialization (before the playback
    -- of the first file), regardless of whether that file will use
    -- video output or not. After that, it runs whenever the video
    -- output (usually a GUI window) is created or destroyed. So if the
    -- first file is a video, it runs twice at startup (false -> true).
    --
    -- Implementation details:
    -- vo-configured == video output created && its configuration went ok.
    -- What that means depends on the platform-specific video output module,
    -- but usually it means there is a GUI on screen to display video.
    mp.observe_property(
        "vo-configured",
        "bool",
        function (name, value)
            if (value) then
                -- Video output (usually a GUI) has been created.

                if (AKGO_WINDOW_KEEP_OPEN_VALUE == "original") then
                    mp.set_property("keep-open", originalKeepOpenValue)
                else
                    mp.set_property("keep-open", AKGO_WINDOW_KEEP_OPEN_VALUE)
                end

                if (AKGO_USE_WINDOW_FOR_AUDIO_AFTER_VIDEO) then
                    mp.set_property("force-window", "yes")
                end
            else
                -- Video output (usually a GUI) has been destroyed.

                if (AKGO_NOWINDOW_KEEP_OPEN_VALUE == "original") then
                    mp.set_property("keep-open", originalKeepOpenValue)
                else
                    mp.set_property("keep-open", AKGO_NOWINDOW_KEEP_OPEN_VALUE)
                end
            end
    end)
end
