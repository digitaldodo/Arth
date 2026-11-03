package com.digitaldodo.arth

import com.digitaldodo.arth.core.security.AppLockManager
import com.digitaldodo.arth.core.security.LockTimeout
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class AppLockManagerTest {

    @Before
    fun setUp() {
        AppLockManager.unlock()
        AppLockManager.isPromptShowing = false
    }

    @Test
    fun appLockStateCanBeManuallyLockedAndUnlocked() {
        assertFalse(AppLockManager.isLocked.value)

        AppLockManager.lock()
        assertTrue(AppLockManager.isLocked.value)

        AppLockManager.unlock()
        assertFalse(AppLockManager.isLocked.value)
    }

    @Test
    fun promptShowingPreventsAccidentalLockingDuringBiometricDisplay() {
        AppLockManager.unlock()
        AppLockManager.isPromptShowing = true

        // Background event while prompt is actively showing
        AppLockManager.onAppBackgrounded()

        // Prompt finished, unlock should still be active
        assertFalse(AppLockManager.isLocked.value)
    }

    @Test
    fun lockTimeoutFromSecondsMapsAccurately() {
        assertEquals(LockTimeout.IMMEDIATELY, LockTimeout.fromSeconds(0))
        assertEquals(LockTimeout.THIRTY_SECONDS, LockTimeout.fromSeconds(30))
        assertEquals(LockTimeout.ONE_MINUTE, LockTimeout.fromSeconds(60))
        assertEquals(LockTimeout.FIVE_MINUTES, LockTimeout.fromSeconds(300))
        assertEquals(LockTimeout.IMMEDIATELY, LockTimeout.fromSeconds(999)) // default fallback
    }

    @Test
    fun lockTimeoutLabelsMatchExpectedUserFacingStrings() {
        assertEquals("Immediately", LockTimeout.IMMEDIATELY.label)
        assertEquals("After 30 seconds", LockTimeout.THIRTY_SECONDS.label)
        assertEquals("After 1 minute", LockTimeout.ONE_MINUTE.label)
        assertEquals("After 5 minutes", LockTimeout.FIVE_MINUTES.label)
    }
}
