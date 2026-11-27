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
    val borderSubtle: Color,
    val borderStrong: Color,
    val surfaceSubtle: Color,
    val surfaceElevated: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textMuted: Color,
    val emerald: Color,
    val emeraldContainer: Color,
    val incomeBorder: Color,
    val crimson: Color,
    val crimsonContainer: Color,
    val expenseBorder: Color,
    val amber: Color,
    val amberContainer: Color,
    val amberBorder: Color,
    val blue: Color,
    val blueContainer: Color,
    val blueBorder: Color,
    val purple: Color,
    val purpleContainer: Color,
    val purpleBorder: Color,
    val tagCashFg: Color,
    val tagCashBg: Color,
    val tagCashBorder: Color,
    val tagOnlineFg: Color,
    val tagOnlineBg: Color,
    val tagOnlineBorder: Color,
    val brandEvergreen: Color = BrandEvergreen,
    val brandCopper: Color = BrandCopper
)

private val LightExtendedColors = ArthExtendedColors(
    border = LightBorderHairline,
    borderSubtle = LightBorderSubtle,
    borderStrong = LightBorderStrong,
    surfaceSubtle = LightSurfaceSubtle,
    surfaceElevated = LightSurfaceElevated,
    textPrimary = LightTextPrimary,
    textSecondary = LightTextSecondary,
    textMuted = LightTextMuted,
    emerald = LightIncomeFg,
    emeraldContainer = LightIncomeBg,
    incomeBorder = LightIncomeBorder,
    crimson = LightExpenseFg,
    crimsonContainer = LightExpenseBg,
    expenseBorder = LightExpenseBorder,
    amber = LightTagOptionalFg,
    amberContainer = LightTagOptionalBg,
    amberBorder = LightTagOptionalBorder,
    blue = LightTagEssentialFg,
    blueContainer = LightTagEssentialBg,
    blueBorder = LightTagEssentialBorder,
    purple = LightTagLuxuryFg,
    purpleContainer = LightTagLuxuryBg,
    purpleBorder = LightTagLuxuryBorder,
    tagCashFg = LightTagCashFg,
    tagCashBg = LightTagCashBg,
    tagCashBorder = LightTagCashBorder,
    tagOnlineFg = LightTagOnlineFg,
    tagOnlineBg = LightTagOnlineBg,
    tagOnlineBorder = LightTagOnlineBorder
)

private val DarkExtendedColors = ArthExtendedColors(
    border = DarkBorderHairline,
    borderSubtle = DarkBorderSubtle,
    borderStrong = DarkBorderStrong,
    surfaceSubtle = DarkSurfaceSubtle,
    surfaceElevated = DarkSurfaceElevated,
    textPrimary = DarkTextPrimary,
    textSecondary = DarkTextSecondary,
    textMuted = DarkTextMuted,
    emerald = DarkIncomeFg,
    emeraldContainer = DarkIncomeBg,
    incomeBorder = DarkIncomeBorder,
    crimson = DarkExpenseFg,
    crimsonContainer = DarkExpenseBg,
    expenseBorder = DarkExpenseBorder,
    amber = DarkTagOptionalFg,
    amberContainer = DarkTagOptionalBg,
    amberBorder = DarkTagOptionalBorder,
    blue = DarkTagEssentialFg,
    blueContainer = DarkTagEssentialBg,
    blueBorder = DarkTagEssentialBorder,
    purple = DarkTagLuxuryFg,
    purpleContainer = DarkTagLuxuryBg,
    purpleBorder = DarkTagLuxuryBorder,
    tagCashFg = DarkTagCashFg,
    tagCashBg = DarkTagCashBg,
    tagCashBorder = DarkTagCashBorder,
    tagOnlineFg = DarkTagOnlineFg,
    tagOnlineBg = DarkTagOnlineBg,
    tagOnlineBorder = DarkTagOnlineBorder
)

val LocalArthColors = staticCompositionLocalOf { LightExtendedColors }

private val LightColorScheme = lightColorScheme(
    primary = LightTextPrimary,
    onPrimary = LightTextInverse,
    primaryContainer = LightSurfaceSubtle,
    onPrimaryContainer = LightTextPrimary,
    secondary = LightTextSecondary,
    onSecondary = LightTextInverse,
    background = LightCanvas,
    onBackground = LightTextPrimary,
    surface = LightSurface,
    onSurface = LightTextPrimary,
    surfaceVariant = LightSurfaceSubtle,
    onSurfaceVariant = LightTextSecondary,
    outline = LightBorderHairline,
    outlineVariant = LightBorderStrong,
    error = LightExpenseFg,
    onError = Color.White
)

private val DarkColorScheme = darkColorScheme(
    primary = DarkTextPrimary,
    onPrimary = DarkTextInverse,
    primaryContainer = DarkSurfaceSubtle,
    onPrimaryContainer = DarkTextPrimary,
    secondary = DarkTextSecondary,
    onSecondary = DarkTextInverse,
    background = DarkCanvas,
    onBackground = DarkTextPrimary,
    surface = DarkSurface,
    onSurface = DarkTextPrimary,
    surfaceVariant = DarkSurfaceSubtle,
    onSurfaceVariant = DarkTextSecondary,
    outline = DarkBorderHairline,
    outlineVariant = DarkBorderStrong,
    error = DarkExpenseFg,
    onError = DarkCanvas
)

@Composable
fun ArthTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    val extendedColors = if (darkTheme) DarkExtendedColors else LightExtendedColors

    CompositionLocalProvider(LocalArthColors provides extendedColors) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = ArthTypography,
            shapes = ArthShapes,
            content = content
        )
    }
}

object ArthTheme {
    val colors: ArthExtendedColors
        @Composable
        get() = LocalArthColors.current
}
