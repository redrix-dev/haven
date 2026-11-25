package __PACKAGE__

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager

class HavenVoiceSoundsPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(HavenVoiceSounds(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class HavenVoiceSounds(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val pending = mutableMapOf<MediaPlayer, Promise>()
  override fun getName() = "HavenVoiceSounds"

  @ReactMethod
  fun play(uri: String, volume: Double, promise: Promise) {
    // Communication usage follows AudioManager's selected communication device,
    // including Bluetooth HFP. Never request media focus or change the route.
    context.runOnUiQueueThread {
      val player = MediaPlayer()
      fun finish(error: String?) {
        val callback = pending.remove(player) ?: return
        player.release()
        if (error == null) callback.resolve(true) else callback.reject("voice_sound", error)
      }
      pending[player] = promise
      try {
        player.setAudioAttributes(AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
        player.setDataSource(context, Uri.parse(uri))
        val gain = volume.coerceIn(0.0, 1.0).toFloat()
        player.setVolume(gain, gain)
        player.setOnCompletionListener { finish(null) }
        player.setOnErrorListener { _, what, extra -> finish("Playback failed: $what/$extra"); true }
        player.setOnPreparedListener {
          try { it.start() } catch (error: Exception) { finish(error.message ?: "Could not start voice sound") }
        }
        player.prepareAsync()
        Handler(Looper.getMainLooper()).postDelayed({ finish("Voice sound interrupted") }, 2000)
      } catch (error: Exception) { finish(error.message ?: "Voice sound failed") }
    }
  }

  override fun invalidate() {
    context.runOnUiQueueThread {
      pending.forEach { (player, promise) ->
        player.release()
        promise.reject("voice_sound", "Voice sound player stopped")
      }
      pending.clear()
    }
    super.invalidate()
  }
}
