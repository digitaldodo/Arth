package com.digitaldodo.arth.core.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

data class ArthExtendedColors(
    val border: Color,
    val borderStrong: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textMuted: Color,
    val emerald: Color,
    val emeraldContainer: Color,
    val crimson: Color,
    val crimsonContainer: Color,
    val amber: Color,
    val amberContainer: Color,
    val blue: Color,
    val blueContainer: Color,
    val purple: Color,
    val purpleContainer: Color
)

val LocalArthColors = staticCompositionLocalOf {
    ArthExtendedColors(
        border = LightBorder,
        borderStrong = LightBorderStrong,
        textPrimary = LightTextPrimary,
        textSecondary = LightTextSecondary,
        textMuted = LightTextMuted,
        emerald = EmeraldPrimary,
        emeraldContainer = EmeraldContainerLight,
        crimson = CrimsonPrimary,
        crimsonContainer = CrimsonContainerLight,
        amber = AmberPrimary,
        amberContainer = AmberContainerLight,
        blue = BluePrimary,
        blueContainer = BlueContainerLight,
        purple = PurplePrimary,
        purpleContainer = PurpleContainerLight
    )
}

private val LightColorScheme = lightColorScheme(
    primary = LightTextPrimary,
    onPrimary = LightSurface,
    primaryContainer = LightSurfaceVariant,
    onPrimaryContainer = LightTextPrimary,
    secondary = LightTextSecondary,
    onSecondary = LightSurface,
    background = LightBackground,
    onBackground = LightTextPrimary,
    surface = LightSurface,
    onSurface = LightTextPrimary,
    surfaceVariant = LightSurfaceVariant,
    onSurfaceVariant = LightTextSecondary,
    outline = LightBorder,
    outlineVariant = LightBorderStrong,
    error = CrimsonPrimary,
    onError = Color.White
)

private val DarkColorScheme = darkColorScheme(
    primary = DarkTextPrimary,
    onPrimary = DarkBackground,
    primaryContainer = DarkSurfaceVariant,
    onPrimaryContainer = DarkTextPrimary,
    secondary = DarkTextSecondary,
    onSecondary = DarkBackground,
    background = DarkBackground,
    onBackground = DarkTextPrimary,
    surface = DarkSurface,
    onSurface = DarkTextPrimary,
    surfaceVariant = DarkSurfaceVariant,
    onSurfaceVariant = DarkTextSecondary,
    outline = DarkBorder,
    outlineVariant = DarkBorderStrong,
    error = CrimsonLight,
    onError = Color.Black
)

@Composable
fun ArthTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    val extendedColors = if (darkTheme) {
        ArthExtendedColors(
            border = DarkBorder,
            borderStrong = DarkBorderStrong,
            textPrimary = DarkTextPrimary,
            textSecondary = DarkTextSecondary,
            textMuted = DarkTextMuted,
            emerald = EmeraldLight,
            emeraldContainer = EmeraldContainerDark,
            crimson = CrimsonLight,
            crimsonContainer = CrimsonContainerDark,
            amber = AmberLight,
            amberContainer = AmberContainerDark,
            blue = BlueLight,
            blueContainer = BlueContainerDark,
            purple = PurpleLight,
            purpleContainer = PurpleContainerDark
        )
    } else {
        ArthExtendedColors(
            border = LightBorder,
            borderStrong = LightBorderStrong,
            textPrimary = LightTextPrimary,
            textSecondary = LightTextSecondary,
            textMuted = LightTextMuted,
            emerald = EmeraldPrimary,
            emeraldContainer = EmeraldContainerLight,
            crimson = CrimsonPrimary,
            crimsonContainer = CrimsonContainerLight,
            amber = AmberPrimary,
            amberContainer = AmberContainerLight,
            blue = BluePrimary,
            blueContainer = BlueContainerLight,
            purple = PurplePrimary,
            purpleContainer = PurpleContainerLight
        )
    }

    CompositionLocalProvider(LocalArthColors provides extendedColors) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = ArthTypography,
            content = content
        )
    }
}

object ArthTheme {
    val colors: ArthExtendedColors
        @Composable
        get() = LocalArthColors.current
}
