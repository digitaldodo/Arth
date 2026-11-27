package com.digitaldodo.arth.core.designsystem

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.digitaldodo.arth.core.model.NecessityTier
import com.digitaldodo.arth.core.model.PaymentMode
import com.digitaldodo.arth.core.model.TransactionType

/**
 * SpendSense geometric brand mark matching frontend/src/components/brand/ArthLogo.tsx.
 * Renders an evergreen rounded container (#193F37), archival folded ledger sheet (#F6F4ED),
 * geometric 'S' stroke, and restrained copper rule (#B67645).
 */
@Composable
fun SpendSenseMark(
    modifier: Modifier = Modifier,
    size: Dp = 28.dp
) {
    Canvas(modifier = modifier.size(size)) {
        val sx = this.size.width / 160f
        val sy = this.size.height / 160f

        drawRoundRect(
            color = BrandEvergreen,
            cornerRadius = CornerRadius(34f * sx, 34f * sy)
        )

        val pagePath = Path().apply {
            moveTo(42f * sx, 20f * sy)
            lineTo(94f * sx, 20f * sy)
            lineTo(128f * sx, 54f * sy)
            lineTo(128f * sx, 132f * sy)
            quadraticTo(128f * sx, 140f * sy, 120f * sx, 140f * sy)
            lineTo(40f * sx, 140f * sy)
            quadraticTo(32f * sx, 140f * sy, 32f * sx, 132f * sy)
            lineTo(32f * sx, 28f * sy)
            quadraticTo(32f * sx, 20f * sy, 42f * sx, 20f * sy)
            close()
        }
        drawPath(pagePath, color = BrandPagePaper)

        val foldPath = Path().apply {
            moveTo(94f * sx, 20f * sy)
            lineTo(94f * sx, 54f * sy)
            lineTo(128f * sx, 54f * sy)
        }
        drawPath(
            foldPath,
            color = BrandPageFold,
            style = Stroke(width = 3f * sx, join = StrokeJoin.Round)
        )

        val sPath = Path().apply {
            moveTo(96f * sx, 57f * sy)
            lineTo(64f * sx, 57f * sy)
            cubicTo(53f * sx, 57f * sy, 47f * sx, 63f * sy, 47f * sx, 72f * sy)
            cubicTo(47f * sx, 80f * sy, 53f * sx, 84f * sy, 64f * sx, 88f * sy)
            lineTo(83f * sx, 94f * sy)
            cubicTo(94f * sx, 98f * sy, 100f * sx, 104f * sy, 100f * sx, 112f * sy)
            cubicTo(100f * sx, 121f * sy, 93f * sx, 127f * sy, 81f * sx, 127f * sy)
            lineTo(49f * sx, 127f * sy)
        }
        drawPath(
            sPath,
            color = BrandEvergreen,
            style = Stroke(width = 10f * sx, cap = StrokeCap.Round, join = StrokeJoin.Round)
        )

        drawLine(
            color = BrandCopper,
            start = Offset(94f * sx, 128f * sy),
            end = Offset(111f * sx, 128f * sy),
            strokeWidth = 5f * sx,
            cap = StrokeCap.Round
        )
    }
}

@Composable
fun SpendSenseBrandLockup(
    modifier: Modifier = Modifier,
    badge: String? = "Ledger",
    markSize: Dp = 26.dp
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        SpendSenseMark(size = markSize)
        Text(
            text = "SpendSense",
            style = MaterialTheme.typography.titleLarge.copy(
                fontWeight = FontWeight.SemiBold,
                letterSpacing = (-0.4).sp
            ),
            color = MaterialTheme.colorScheme.onBackground
        )
        if (!badge.isNullOrBlank()) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(3.dp))
                    .background(ArthTheme.colors.surfaceSubtle)
                    .border(1.dp, ArthTheme.colors.border, RoundedCornerShape(3.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    text = badge,
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                    color = ArthTheme.colors.textSecondary
                )
            }
        }
    }
}

@Composable
fun ArthCard(
    modifier: Modifier = Modifier,
    backgroundColor: Color = MaterialTheme.colorScheme.surface,
    borderColor: Color = ArthTheme.colors.border,
    borderWidth: Dp = 1.dp,
    shapeRadius: Dp = 6.dp,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    val shape = RoundedCornerShape(shapeRadius)
    val clickModifier = if (onClick != null) Modifier.clickable { onClick() } else Modifier

    Surface(
        modifier = modifier
            .clip(shape)
            .border(BorderStroke(borderWidth, borderColor), shape)
            .then(clickModifier),
        shape = shape,
        color = backgroundColor,
        tonalElevation = 0.dp,
        shadowElevation = 0.dp
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            content = content
        )
    }
}

@Composable
fun ArthButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    isLoading: Boolean = false,
    icon: ImageVector? = null,
    backgroundColor: Color = MaterialTheme.colorScheme.primary,
    contentColor: Color = MaterialTheme.colorScheme.onPrimary
) {
    Button(
        onClick = onClick,
        modifier = modifier.height(46.dp),
        enabled = enabled && !isLoading,
        shape = RoundedCornerShape(6.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = backgroundColor,
            contentColor = contentColor,
            disabledContainerColor = backgroundColor.copy(alpha = 0.4f),
            disabledContentColor = contentColor.copy(alpha = 0.6f)
        ),
        elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp, pressedElevation = 0.dp)
    ) {
        if (isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                color = contentColor,
                strokeWidth = 2.dp
            )
        } else {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                if (icon != null) {
                    Icon(icon, contentDescription = null, modifier = Modifier.size(17.dp))
                    Spacer(Modifier.width(8.dp))
                }
                Text(
                    text = text,
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold)
                )
            }
        }
    }
}

@Composable
fun ArthOutlinedButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null,
    borderColor: Color = ArthTheme.colors.borderStrong,
    contentColor: Color = MaterialTheme.colorScheme.onSurface
) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier.height(46.dp),
        enabled = enabled,
        shape = RoundedCornerShape(6.dp),
        border = BorderStroke(1.dp, borderColor),
        colors = ButtonDefaults.outlinedButtonColors(
            contentColor = contentColor
        )
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            if (icon != null) {
                Icon(icon, contentDescription = null, modifier = Modifier.size(17.dp))
                Spacer(Modifier.width(8.dp))
            }
            Text(
                text = text,
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Medium)
            )
        }
    }
}

@Composable
fun NecessityBadge(
    necessity: NecessityTier,
    modifier: Modifier = Modifier
) {
    val (label, bg, fg, border) = when (necessity) {
        NecessityTier.ESSENTIAL -> listOf("▲ Essential", ArthTheme.colors.blueContainer, ArthTheme.colors.blue, ArthTheme.colors.blueBorder)
        NecessityTier.OPTIONAL -> listOf("● Optional", ArthTheme.colors.amberContainer, ArthTheme.colors.amber, ArthTheme.colors.amberBorder)
        NecessityTier.LUXURY -> listOf("◆ Luxury", ArthTheme.colors.purpleContainer, ArthTheme.colors.purple, ArthTheme.colors.purpleBorder)
    }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(3.dp))
            .background(bg as Color)
            .border(1.dp, border as Color, RoundedCornerShape(3.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label as String,
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
            color = fg as Color
        )
    }
}

@Composable
fun PaymentBadge(
    mode: PaymentMode,
    modifier: Modifier = Modifier
) {
    val (label, bg, fg, border) = when (mode) {
        PaymentMode.CASH -> listOf("Cash", ArthTheme.colors.tagCashBg, ArthTheme.colors.tagCashFg, ArthTheme.colors.tagCashBorder)
        PaymentMode.ONLINE -> listOf("Online", ArthTheme.colors.tagOnlineBg, ArthTheme.colors.tagOnlineFg, ArthTheme.colors.tagOnlineBorder)
    }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(3.dp))
            .background(bg as Color)
            .border(1.dp, border as Color, RoundedCornerShape(3.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label as String,
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
            color = fg as Color
        )
    }
}

@Composable
fun TypeBadge(
    type: TransactionType,
    modifier: Modifier = Modifier
) {
    val (label, bg, fg, border) = when (type) {
        TransactionType.INCOME -> listOf("↑ Income", ArthTheme.colors.emeraldContainer, ArthTheme.colors.emerald, ArthTheme.colors.incomeBorder)
        TransactionType.EXPENSE -> listOf("↓ Expense", ArthTheme.colors.crimsonContainer, ArthTheme.colors.crimson, ArthTheme.colors.expenseBorder)
    }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(3.dp))
            .background(bg as Color)
            .border(1.dp, border as Color, RoundedCornerShape(3.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label as String,
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
            color = fg as Color
        )
    }
}

@Composable
fun AmountDisplay(
    amountFormatted: String,
    type: TransactionType,
    modifier: Modifier = Modifier,
    large: Boolean = false
) {
    val color = when (type) {
        TransactionType.INCOME -> ArthTheme.colors.emerald
        TransactionType.EXPENSE -> ArthTheme.colors.crimson
    }

    Text(
        text = amountFormatted,
        modifier = modifier,
        style = if (large) {
            ArthFigureHeroStyle.copy(fontSize = 24.sp, lineHeight = 30.sp)
        } else {
            ArthFigureMediumStyle
        },
        color = color
    )
}

@Composable
fun SelectablePill(
    text: String,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val bg = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface
    val fg = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
    val border = if (selected) MaterialTheme.colorScheme.primary else ArthTheme.colors.borderSubtle

    Box(
        modifier = modifier
            .height(38.dp)
            .clip(RoundedCornerShape(4.dp))
            .border(1.dp, border, RoundedCornerShape(4.dp))
            .background(bg)
            .clickable { onClick() }
            .padding(horizontal = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
            color = fg
        )
    }
}

@Composable
fun TabButton(
    text: String,
    selected: Boolean,
    selectedBg: Color,
    selectedFg: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val bg = if (selected) selectedBg else Color.Transparent
    val fg = if (selected) selectedFg else MaterialTheme.colorScheme.onSurfaceVariant

    Box(
        modifier = modifier
            .fillMaxHeight()
            .clip(RoundedCornerShape(4.dp))
            .background(bg)
            .clickable { onClick() },
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
            color = fg
        )
    }
}
