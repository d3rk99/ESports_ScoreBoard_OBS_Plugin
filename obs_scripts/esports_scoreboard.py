# Esports Scoreboard OBS Python Script
#
# Usage:
# 1) Tools -> Scripts -> + -> select this file.
# 2) Configure API URL and source names in script properties.
# 3) Start the Node server, then click "Refresh now" or wait for timer updates.

import json
import urllib.request
import urllib.error
import obs
from pathlib import Path

SCRIPT_DESCRIPTION = "Syncs OBS text/image sources from Esports_Scoreboard_OBSTool /api/state"

settings_cache = {
    "api_url": "http://127.0.0.1:3000/api/state",
    "refresh_ms": 500,
    "logos_dir": "",
    "team1_name_source": "",
    "team2_name_source": "",
    "team1_score_source": "",
    "team2_score_source": "",
    "team1_logo_source": "",
    "team2_logo_source": "",
    "last_error": "",
}


def script_description():
    return SCRIPT_DESCRIPTION


def _log(msg):
    obs.script_log(obs.LOG_INFO, f"[EsportsScoreboard] {msg}")


def _log_error(msg):
    obs.script_log(obs.LOG_WARNING, f"[EsportsScoreboard] {msg}")


def _set_text_source(source_name, value):
    if not source_name:
        return

    source = obs.obs_get_source_by_name(source_name)
    if source is None:
        raise RuntimeError(f"Text source not found: {source_name}")

    data = obs.obs_data_create()
    obs.obs_data_set_string(data, "text", str(value))
    obs.obs_source_update(source, data)
    obs.obs_data_release(data)
    obs.obs_source_release(source)


def _set_image_source(source_name, file_path):
    if not source_name:
        return

    source = obs.obs_get_source_by_name(source_name)
    if source is None:
        raise RuntimeError(f"Image source not found: {source_name}")

    data = obs.obs_data_create()
    obs.obs_data_set_string(data, "file", str(file_path))
    obs.obs_source_update(source, data)
    obs.obs_data_release(data)
    obs.obs_source_release(source)


def _fetch_state():
    req = urllib.request.Request(settings_cache["api_url"], headers={"User-Agent": "OBS-Python-Esports-Scoreboard"})
    with urllib.request.urlopen(req, timeout=2.0) as response:
        raw = response.read().decode("utf-8")
        parsed = json.loads(raw)
        return parsed.get("state", {})


def _resolve_logo_path(file_name):
    if not file_name:
        return ""

    base = (settings_cache.get("logos_dir") or "").strip()
    if not base:
        return ""

    return str((Path(base) / file_name).resolve())


def _apply_state(state):
    team1 = state.get("team1", {})
    team2 = state.get("team2", {})

    _set_text_source(settings_cache["team1_name_source"], team1.get("name", ""))
    _set_text_source(settings_cache["team2_name_source"], team2.get("name", ""))
    _set_text_source(settings_cache["team1_score_source"], team1.get("score", 0))
    _set_text_source(settings_cache["team2_score_source"], team2.get("score", 0))

    team1_logo = team1.get("logo", "")
    team2_logo = team2.get("logo", "")

    _set_image_source(settings_cache["team1_logo_source"], _resolve_logo_path(team1_logo))
    _set_image_source(settings_cache["team2_logo_source"], _resolve_logo_path(team2_logo))


def tick_sync():
    try:
        state = _fetch_state()
        _apply_state(state)
        if settings_cache["last_error"]:
            _log("Connection restored")
        settings_cache["last_error"] = ""
    except (urllib.error.URLError, TimeoutError, ValueError, RuntimeError) as ex:
        message = str(ex)
        if message != settings_cache["last_error"]:
            _log_error(message)
        settings_cache["last_error"] = message


def script_properties():
    props = obs.obs_properties_create()

    obs.obs_properties_add_text(props, "api_url", "State API URL", obs.OBS_TEXT_DEFAULT)
    obs.obs_properties_add_int(props, "refresh_ms", "Refresh interval (ms)", 100, 5000, 50)
    obs.obs_properties_add_text(props, "logos_dir", "Logos directory (absolute path)", obs.OBS_TEXT_DEFAULT)

    obs.obs_properties_add_text(props, "team1_name_source", "Team 1 Name Text Source", obs.OBS_TEXT_DEFAULT)
    obs.obs_properties_add_text(props, "team2_name_source", "Team 2 Name Text Source", obs.OBS_TEXT_DEFAULT)
    obs.obs_properties_add_text(props, "team1_score_source", "Team 1 Score Text Source", obs.OBS_TEXT_DEFAULT)
    obs.obs_properties_add_text(props, "team2_score_source", "Team 2 Score Text Source", obs.OBS_TEXT_DEFAULT)
    obs.obs_properties_add_text(props, "team1_logo_source", "Team 1 Logo Image Source", obs.OBS_TEXT_DEFAULT)
    obs.obs_properties_add_text(props, "team2_logo_source", "Team 2 Logo Image Source", obs.OBS_TEXT_DEFAULT)

    obs.obs_properties_add_button(props, "refresh_now", "Refresh now", _on_refresh_now)

    return props


def _on_refresh_now(props, prop):
    tick_sync()
    return True


def _read_settings(settings):
    settings_cache["api_url"] = obs.obs_data_get_string(settings, "api_url") or "http://127.0.0.1:3000/api/state"
    settings_cache["refresh_ms"] = int(obs.obs_data_get_int(settings, "refresh_ms") or 500)

    settings_cache["logos_dir"] = obs.obs_data_get_string(settings, "logos_dir")
    settings_cache["team1_name_source"] = obs.obs_data_get_string(settings, "team1_name_source")
    settings_cache["team2_name_source"] = obs.obs_data_get_string(settings, "team2_name_source")
    settings_cache["team1_score_source"] = obs.obs_data_get_string(settings, "team1_score_source")
    settings_cache["team2_score_source"] = obs.obs_data_get_string(settings, "team2_score_source")
    settings_cache["team1_logo_source"] = obs.obs_data_get_string(settings, "team1_logo_source")
    settings_cache["team2_logo_source"] = obs.obs_data_get_string(settings, "team2_logo_source")


def script_defaults(settings):
    obs.obs_data_set_default_string(settings, "api_url", "http://127.0.0.1:3000/api/state")
    obs.obs_data_set_default_int(settings, "refresh_ms", 500)
    obs.obs_data_set_default_string(settings, "logos_dir", "")


def script_update(settings):
    _read_settings(settings)
    obs.timer_remove(tick_sync)
    obs.timer_add(tick_sync, max(100, settings_cache["refresh_ms"]))
    tick_sync()


def script_load(settings):
    _read_settings(settings)
    obs.timer_add(tick_sync, max(100, settings_cache["refresh_ms"]))
    _log("Loaded")


def script_unload():
    obs.timer_remove(tick_sync)
    _log("Unloaded")
