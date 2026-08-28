package com.aeronav.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Requests/abandons transient "duck" audio focus around spoken turn-by-turn
 * instructions (see native-audio-focus.js/native-tts.js) — holding this
 * focus is what makes Android quieten other apps' audio (music, including
 * over Bluetooth, confirmed live to otherwise play at full volume right on
 * top of guidance) for as long as it's held, and let it back up once
 * released. AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK plus
 * USAGE_ASSISTANCE_NAVIGATION_GUIDANCE is the standard combination
 * navigation apps use specifically because it signals "duck, don't pause"
 * to the system and to other apps, rather than silencing them outright.
 * Ref-counting (so this only actually round-trips at real 0-&gt;1/1-&gt;0
 * transitions) lives in JS, not here — see native-audio-focus.js.
 */
@CapacitorPlugin(name = "AudioFocus")
public class AudioFocusPlugin extends Plugin {
  // Only meaningful on API 26+ (AudioFocusRequest itself doesn't exist
  // below that) — the pre-26 fallback path just needs the same listener
  // instance back for abandonAudioFocus, no request object to keep around.
  private AudioFocusRequest focusRequest;
  private final AudioManager.OnAudioFocusChangeListener noopListener = focusChange -> { };

  @PluginMethod
  public void requestFocus(PluginCall call) {
    AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    if (audioManager != null) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        if (focusRequest == null) {
          AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build();
          focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(attrs)
            .build();
          audioManager.requestAudioFocus(focusRequest);
        }
      } else {
        audioManager.requestAudioFocus(noopListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
      }
    }
    call.resolve();
  }

  @PluginMethod
  public void abandonFocus(PluginCall call) {
    AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    if (audioManager != null) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        if (focusRequest != null) {
          audioManager.abandonAudioFocusRequest(focusRequest);
          focusRequest = null;
        }
      } else {
        audioManager.abandonAudioFocus(noopListener);
      }
    }
    call.resolve();
  }
}
