package com.securevault.app;

import android.app.admin.DeviceAdminReceiver;

/**
 * Optional, user-enabled Android Device Administrator.
 * It requests no wipe, password, or force-lock policies. Android normally
 * requires this administrator to be deactivated before uninstalling the app.
 */
public final class FolderLockerAdminReceiver extends DeviceAdminReceiver {
}
