package expo.modules.pip

import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PipModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Pip")

    Function("isSupported") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        appContext.reactContext?.packageManager
          ?.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE) == true
    }

    Function("enterPipMode") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val activity = appContext.currentActivity ?: return@Function
        activity.enterPictureInPictureMode(
          PictureInPictureParams.Builder().build()
        )
      }
    }
  }
}
