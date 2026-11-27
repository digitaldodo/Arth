package com.digitaldodo.arth.feature.auth

import android.app.Activity
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.digitaldodo.arth.core.designsystem.ArthButton
import com.digitaldodo.arth.core.designsystem.ArthCard
import com.digitaldodo.arth.core.designsystem.ArthOutlinedButton
import com.digitaldodo.arth.core.designsystem.ArthTheme
import com.digitaldodo.arth.core.designsystem.BrandCopper
import com.digitaldodo.arth.core.designsystem.BrandEvergreen
import com.digitaldodo.arth.core.designsystem.SpendSenseBrandLockup
import com.digitaldodo.arth.core.designsystem.ThemeMode
import com.digitaldodo.arth.core.designsystem.ThemePreferenceStore

@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onLoginSuccess: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    val themeMode by ThemePreferenceStore.themeMode.collectAsState()
    val focusManager = LocalFocusManager.current
    val context = LocalContext.current
    val activity = context as? Activity
    val scrollState = rememberScrollState()
    val isDark = when (themeMode) {
        ThemeMode.DARK -> true
        ThemeMode.LIGHT -> false
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
    }
    val isBusy = state.isLoading || state.isGoogleLoading

    LaunchedEffect(state.isAuthenticated) {
        if (state.isAuthenticated) {
            onLoginSuccess()
        }
    }

    LaunchedEffect(Unit) {
        viewModel.checkAuthConnectivity()
    }

    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedContainerColor = MaterialTheme.colorScheme.background,
        unfocusedContainerColor = MaterialTheme.colorScheme.background,
        disabledContainerColor = ArthTheme.colors.surfaceSubtle,
        focusedBorderColor = if (isDark) ArthTheme.colors.emerald else BrandEvergreen,
        unfocusedBorderColor = ArthTheme.colors.border,
        focusedLabelColor = if (isDark) ArthTheme.colors.emerald else BrandEvergreen,
        unfocusedLabelColor = ArthTheme.colors.textSecondary,
        cursorColor = MaterialTheme.colorScheme.onSurface,
        focusedTextColor = MaterialTheme.colorScheme.onSurface,
        unfocusedTextColor = MaterialTheme.colorScheme.onSurface,
        focusedPlaceholderColor = ArthTheme.colors.textMuted,
        unfocusedPlaceholderColor = ArthTheme.colors.textMuted
    )

    val evergreenAccent = if (isDark) ArthTheme.colors.emerald else BrandEvergreen
    val evergreenSoft = if (isDark) BrandEvergreen.copy(alpha = 0.36f) else Color(0xFFEEF4F2)

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Top Utility Bar: Service indicator + Obsidian/Warm Paper Theme Switcher
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 460.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                ConnectionBadge(
                    connectionState = state.connectionState,
                    onRetry = { viewModel.checkAuthConnectivity() }
                )

                ThemePillToggle(
                    isDark = isDark,
                    onSelectTheme = { dark ->
                        ThemePreferenceStore.setThemeMode(
                            context,
                            if (dark) ThemeMode.DARK else ThemeMode.LIGHT
                        )
                    }
                )
            }

            Spacer(Modifier.height(22.dp))

            // Brand Identity Header (Ledger Minimal lockup + architectural accent bar)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 460.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                SpendSenseBrandLockup(
                    badge = "Ledger",
                    markSize = 30.dp
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .width(28.dp)
                            .height(2.dp)
                            .clip(RoundedCornerShape(1.dp))
                            .background(BrandEvergreen)
                    )
                    Box(
                        modifier = Modifier
                            .width(12.dp)
                            .height(2.dp)
                            .clip(RoundedCornerShape(1.dp))
                            .background(BrandCopper)
                    )
                    Text(
                        text = "Personal Financial Ledger",
                        style = MaterialTheme.typography.labelMedium,
                        color = ArthTheme.colors.textSecondary
                    )
                }

                Text(
                    text = "Intentional integer-paise tracking with private account sync.",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArthTheme.colors.textMuted
                )
            }

            Spacer(Modifier.height(18.dp))

            // Primary Archival Authentication Card
            ArthCard(
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 460.dp),
                backgroundColor = MaterialTheme.colorScheme.surface,
                borderColor = ArthTheme.colors.border,
                shapeRadius = 8.dp
            ) {
                // Restrained Evergreen-Copper hairline bar
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(2.dp)
                        .clip(RoundedCornerShape(1.dp))
                ) {
                    Box(
                        modifier = Modifier
                            .weight(0.78f)
                            .fillMaxHeight()
                            .background(BrandEvergreen)
                    )
                    Box(
                        modifier = Modifier
                            .weight(0.22f)
                            .fillMaxHeight()
                            .background(BrandCopper)
                    )
                }

                Spacer(Modifier.height(16.dp))

                // Title & subtitle for active auth mode
                Text(
                    text = when (state.authMode) {
                        AuthMode.SIGN_IN -> "Sign in to SpendSense"
                        AuthMode.SIGN_UP -> "Create your ledger account"
                        AuthMode.FORGOT_PASSWORD -> "Reset password"
                    },
                    style = MaterialTheme.typography.titleLarge.copy(
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 20.sp,
                        letterSpacing = (-0.3).sp
                    ),
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = when (state.authMode) {
                        AuthMode.SIGN_IN -> "Access your transactions, balances, and synced ledger."
                        AuthMode.SIGN_UP -> "Set up your SpendSense ledger credentials."
                        AuthMode.FORGOT_PASSWORD -> "Enter your email or username for a recovery link."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = ArthTheme.colors.textSecondary
                )

                // Sign In / Create Account Mode Switcher
                if (state.authMode != AuthMode.FORGOT_PASSWORD) {
                    Spacer(Modifier.height(16.dp))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(6.dp))
                            .background(ArthTheme.colors.surfaceSubtle)
                            .border(1.dp, ArthTheme.colors.border, RoundedCornerShape(6.dp))
                            .padding(3.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        ModeTab(
                            label = "Sign In",
                            selected = state.authMode == AuthMode.SIGN_IN,
                            enabled = !isBusy,
                            modifier = Modifier.weight(1f),
                            onClick = { viewModel.setAuthMode(AuthMode.SIGN_IN) }
                        )
                        ModeTab(
                            label = "Create Account",
                            selected = state.authMode == AuthMode.SIGN_UP,
                            enabled = !isBusy,
                            modifier = Modifier.weight(1f),
                            onClick = { viewModel.setAuthMode(AuthMode.SIGN_UP) }
                        )
                    }
                }

                // Connectivity diagnostic notice (never masquerades as bad password)
                if (state.connectionState == ConnectionState.DEGRADED ||
                    state.connectionState == ConnectionState.UNAVAILABLE
                ) {
                    Spacer(Modifier.height(14.dp))
                    DiagnosticConnectionBanner(
                        connectionState = state.connectionState,
                        notice = state.connectionNotice,
                        onRetry = { viewModel.checkAuthConnectivity() }
                    )
                }

                // Error or success feedback alert
                AuthStatusAlert(
                    errorMessage = state.errorMessage,
                    successMessage = state.successMessage,
                    showBrowserFallback = state.showBrowserGoogleFallback,
                    evergreenAccent = evergreenAccent,
                    evergreenSoft = evergreenSoft,
                    onBrowserFallback = {
                        viewModel.startBrowserGoogleSignIn(context, triggeredByFallback = false)
                    },
                    onDismiss = { viewModel.clearStatusMessages() }
                )

                Spacer(Modifier.height(16.dp))

                when (state.authMode) {
                    AuthMode.SIGN_IN -> {
                        OutlinedTextField(
                            value = state.identifier,
                            onValueChange = { viewModel.onIdentifierChanged(it) },
                            label = { Text("Username or Email") },
                            placeholder = { Text("rahul_sharma or you@domain.com") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            enabled = !isBusy,
                            shape = RoundedCornerShape(6.dp),
                            colors = fieldColors,
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Email,
                                autoCorrectEnabled = false,
                                imeAction = ImeAction.Next
                            ),
                            keyboardActions = KeyboardActions(
                                onNext = { focusManager.moveFocus(FocusDirection.Down) }
                            )
                        )

                        Spacer(Modifier.height(12.dp))

                        OutlinedTextField(
                            value = state.password,
                            onValueChange = { viewModel.onPasswordChanged(it) },
                            label = { Text("Password") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            enabled = !isBusy,
                            shape = RoundedCornerShape(6.dp),
                            colors = fieldColors,
                            visualTransformation = if (state.isPasswordVisible) {
                                VisualTransformation.None
                            } else {
                                PasswordVisualTransformation()
                            },
                            trailingIcon = {
                                IconButton(
                                    onClick = { viewModel.togglePasswordVisibility() },
                                    enabled = !isBusy
                                ) {
                                    Icon(
                                        imageVector = if (state.isPasswordVisible) {
                                            Icons.Default.VisibilityOff
                                        } else {
                                            Icons.Default.Visibility
                                        },
                                        contentDescription = if (state.isPasswordVisible) {
                                            "Hide password"
                                        } else {
                                            "Show password"
                                        },
                                        tint = ArthTheme.colors.textMuted
                                    )
                                }
                            },
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Password,
                                autoCorrectEnabled = false,
                                imeAction = ImeAction.Done
                            ),
                            keyboardActions = KeyboardActions(
                                onDone = {
                                    focusManager.clearFocus()
                                    viewModel.login(onLoginSuccess)
                                }
                            )
                        )

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 8.dp),
                            horizontalArrangement = Arrangement.End
                        ) {
                            Text(
                                text = "Forgot password?",
                                style = MaterialTheme.typography.labelMedium,
                                color = if (isBusy) ArthTheme.colors.textMuted else ArthTheme.colors.textSecondary,
                                modifier = Modifier
                                    .clickable(enabled = !isBusy) {
                                        viewModel.setAuthMode(AuthMode.FORGOT_PASSWORD)
                                    }
                                    .padding(vertical = 4.dp, horizontal = 2.dp)
                            )
                        }

                        Spacer(Modifier.height(16.dp))

                        ArthButton(
                            text = "Sign In",
                            onClick = {
                                focusManager.clearFocus()
                                viewModel.login(onLoginSuccess)
                            },
                            isLoading = state.isLoading,
                            enabled = !isBusy,
                            modifier = Modifier.fillMaxWidth(),
                            backgroundColor = MaterialTheme.colorScheme.primary,
                            contentColor = MaterialTheme.colorScheme.onPrimary
                        )

                        Spacer(Modifier.height(16.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            HorizontalDivider(
                                modifier = Modifier.weight(1f),
                                color = ArthTheme.colors.border
                            )
                            Text(
                                text = "  or  ",
                                style = MaterialTheme.typography.labelSmall,
                                color = ArthTheme.colors.textMuted
                            )
                            HorizontalDivider(
                                modifier = Modifier.weight(1f),
                                color = ArthTheme.colors.border
                            )
                        }

                        Spacer(Modifier.height(16.dp))

                        ArthOutlinedButton(
                            text = if (state.isGoogleLoading) "Connecting Google..." else "Continue with Google",
                            onClick = {
                                focusManager.clearFocus()
                                if (activity != null) {
                                    viewModel.signInWithNativeGoogle(activity, onLoginSuccess)
                                } else {
                                    viewModel.startBrowserGoogleSignIn(context)
                                }
                            },
                            enabled = !isBusy,
                            modifier = Modifier.fillMaxWidth(),
                            borderColor = ArthTheme.colors.border,
                            contentColor = MaterialTheme.colorScheme.onSurface
                        )

                        if (state.showBrowserGoogleFallback) {
                            Spacer(Modifier.height(10.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.Center
                            ) {
                                Text(
                                    text = "Sign in using secure browser instead",
                                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Medium),
                                    color = evergreenAccent,
                                    modifier = Modifier
                                        .clickable(enabled = !isBusy) {
                                            viewModel.startBrowserGoogleSignIn(context)
                                        }
                                        .padding(4.dp)
                                )
                            }
                        }
                    }

                    AuthMode.SIGN_UP -> {
                        OutlinedTextField(
                            value = state.email,
                            onValueChange = { viewModel.onEmailChanged(it) },
                            label = { Text("Email Address") },
                            placeholder = { Text("you@domain.com") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            enabled = !isBusy,
                            shape = RoundedCornerShape(6.dp),
                            colors = fieldColors,
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Email,
                                autoCorrectEnabled = false,
                                imeAction = ImeAction.Next
                            ),
                            keyboardActions = KeyboardActions(
                                onNext = { focusManager.moveFocus(FocusDirection.Down) }
                            )
                        )

                        Spacer(Modifier.height(12.dp))

                        OutlinedTextField(
                            value = state.username,
                            onValueChange = { viewModel.onUsernameChanged(it) },
                            label = { Text("Username (Optional)") },
                            placeholder = { Text("e.g. rahul_sharma") },
                            supportingText = {
                                Text("3-20 lowercase characters: letters, numbers, underscores")
                            },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            enabled = !isBusy,
                            shape = RoundedCornerShape(6.dp),
                            colors = fieldColors,
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Text,
                                autoCorrectEnabled = false,
                                imeAction = ImeAction.Next
                            ),
                            keyboardActions = KeyboardActions(
                                onNext = { focusManager.moveFocus(FocusDirection.Down) }
                            )
                        )

                        Spacer(Modifier.height(12.dp))

                        OutlinedTextField(
                            value = state.password,
                            onValueChange = { viewModel.onPasswordChanged(it) },
                            label = { Text("Password") },
                            supportingText = { Text("Minimum 8 characters") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            enabled = !isBusy,
                            shape = RoundedCornerShape(6.dp),
                            colors = fieldColors,
                            visualTransformation = if (state.isPasswordVisible) {
                                VisualTransformation.None
                            } else {
                                PasswordVisualTransformation()
                            },
                            trailingIcon = {
                                IconButton(
                                    onClick = { viewModel.togglePasswordVisibility() },
                                    enabled = !isBusy
                                ) {
                                    Icon(
                                        imageVector = if (state.isPasswordVisible) {
                                            Icons.Default.VisibilityOff
                                        } else {
                                            Icons.Default.Visibility
                                        },
                                        contentDescription = if (state.isPasswordVisible) {
                                            "Hide password"
                                        } else {
                                            "Show password"
                                        },
                                        tint = ArthTheme.colors.textMuted
                                    )
                                }
                            },
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Password,
                                autoCorrectEnabled = false,
                                imeAction = ImeAction.Next
                            ),
                            keyboardActions = KeyboardActions(
                                onNext = { focusManager.moveFocus(FocusDirection.Down) }
                            )
                        )

                        Spacer(Modifier.height(12.dp))

                        OutlinedTextField(
                            value = state.confirmPassword,
                            onValueChange = { viewModel.onConfirmPasswordChanged(it) },
                            label = { Text("Confirm Password") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            enabled = !isBusy,
                            shape = RoundedCornerShape(6.dp),
                            colors = fieldColors,
                            visualTransformation = if (state.isConfirmPasswordVisible) {
                                VisualTransformation.None
                            } else {
                                PasswordVisualTransformation()
                            },
                            trailingIcon = {
                                IconButton(
                                    onClick = { viewModel.toggleConfirmPasswordVisibility() },
                                    enabled = !isBusy
                                ) {
                                    Icon(
                                        imageVector = if (state.isConfirmPasswordVisible) {
                                            Icons.Default.VisibilityOff
                                        } else {
                                            Icons.Default.Visibility
                                        },
                                        contentDescription = if (state.isConfirmPasswordVisible) {
                                            "Hide confirm password"
                                        } else {
                                            "Show confirm password"
                                        },
                                        tint = ArthTheme.colors.textMuted
                                    )
                                }
                            },
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Password,
                                autoCorrectEnabled = false,
                                imeAction = ImeAction.Done
                            ),
                            keyboardActions = KeyboardActions(
                                onDone = {
                                    focusManager.clearFocus()
                                    viewModel.signUp(onLoginSuccess)
                                }
                            )
                        )

                        Spacer(Modifier.height(18.dp))

                        ArthButton(
                            text = "Create Account",
                            onClick = {
                                focusManager.clearFocus()
                                viewModel.signUp(onLoginSuccess)
                            },
                            isLoading = state.isLoading,
                            enabled = !isBusy,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }

                    AuthMode.FORGOT_PASSWORD -> {
                        OutlinedTextField(
                            value = state.identifier,
                            onValueChange = { viewModel.onIdentifierChanged(it) },
                            label = { Text("Username or Email") },
                            placeholder = { Text("you@domain.com or username") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            enabled = !isBusy,
                            shape = RoundedCornerShape(6.dp),
                            colors = fieldColors,
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Email,
                                autoCorrectEnabled = false,
                                imeAction = ImeAction.Done
                            ),
                            keyboardActions = KeyboardActions(
                                onDone = {
                                    focusManager.clearFocus()
                                    viewModel.forgotPassword()
                                }
                            )
                        )

                        Spacer(Modifier.height(18.dp))

                        ArthButton(
                            text = "Send Reset Link",
                            onClick = {
                                focusManager.clearFocus()
                                viewModel.forgotPassword()
                            },
                            isLoading = state.isLoading,
                            enabled = !isBusy,
                            modifier = Modifier.fillMaxWidth()
                        )

                        Spacer(Modifier.height(14.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.Center
                        ) {
                            Text(
                                text = "Back to Sign In",
                                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                                color = if (isBusy) ArthTheme.colors.textMuted else MaterialTheme.colorScheme.primary,
                                modifier = Modifier
                                    .clickable(enabled = !isBusy) {
                                        viewModel.setAuthMode(AuthMode.SIGN_IN)
                                    }
                                    .padding(6.dp)
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(18.dp))

            // Quiet Offline Option & Archival Integrity Footnote
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 460.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Integer paise · Zero telemetry",
                    style = MaterialTheme.typography.labelSmall,
                    color = ArthTheme.colors.textMuted
                )
                Text(
                    text = "Continue Offline",
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Medium),
                    color = if (isBusy) ArthTheme.colors.textMuted else ArthTheme.colors.textSecondary,
                    modifier = Modifier
                        .clickable(enabled = !isBusy) { viewModel.continueOffline(onLoginSuccess) }
                        .padding(vertical = 6.dp, horizontal = 4.dp)
                )
            }
        }
    }
}

@Composable
private fun ModeTab(
    label: String,
    selected: Boolean,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .clickable(enabled = enabled, onClick = onClick),
        shape = RoundedCornerShape(4.dp),
        color = if (selected) MaterialTheme.colorScheme.surface else Color.Transparent,
        border = if (selected) BorderStroke(1.dp, ArthTheme.colors.border) else null
    ) {
        Box(
            modifier = Modifier.padding(vertical = 8.dp, horizontal = 8.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium.copy(
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium
                ),
                color = if (selected) MaterialTheme.colorScheme.onSurface else ArthTheme.colors.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun ThemePillToggle(
    isDark: Boolean,
    onSelectTheme: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .background(ArthTheme.colors.surfaceSubtle)
            .border(1.dp, ArthTheme.colors.border, RoundedCornerShape(4.dp))
            .padding(2.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        ThemePillOption(
            label = "Paper",
            dotColor = BrandCopper,
            selected = !isDark,
            onClick = { onSelectTheme(false) }
        )
        ThemePillOption(
            label = "Obsidian",
            dotColor = BrandEvergreen,
            selected = isDark,
            onClick = { onSelectTheme(true) }
        )
    }
}

@Composable
private fun ThemePillOption(
    label: String,
    dotColor: Color,
    selected: Boolean,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .clip(RoundedCornerShape(3.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(3.dp),
        color = if (selected) MaterialTheme.colorScheme.surface else Color.Transparent,
        border = if (selected) BorderStroke(1.dp, ArthTheme.colors.border) else null
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(dotColor)
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium
                ),
                color = if (selected) MaterialTheme.colorScheme.onSurface else ArthTheme.colors.textSecondary
            )
        }
    }
}

@Composable
private fun ConnectionBadge(
    connectionState: ConnectionState,
    onRetry: () -> Unit
) {
    val (dotColor, label) = when (connectionState) {
        ConnectionState.READY -> ArthTheme.colors.emerald to "Sync ready"
        ConnectionState.DEGRADED -> BrandCopper to "Offline or limited"
        ConnectionState.UNAVAILABLE -> ArthTheme.colors.crimson to "Service unreachable"
        ConnectionState.CHECKING -> ArthTheme.colors.textMuted to "Checking sync..."
    }

    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .background(ArthTheme.colors.surfaceSubtle)
            .border(1.dp, ArthTheme.colors.border, RoundedCornerShape(4.dp))
            .clickable { onRetry() }
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .clip(CircleShape)
                .background(dotColor)
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = ArthTheme.colors.textSecondary
        )
    }
}

@Composable
private fun DiagnosticConnectionBanner(
    connectionState: ConnectionState,
    notice: String?,
    onRetry: () -> Unit
) {
    val isDegraded = connectionState == ConnectionState.DEGRADED
    val containerColor = if (isDegraded) ArthTheme.colors.amberContainer else ArthTheme.colors.surfaceSubtle
    val borderColor = if (isDegraded) BrandCopper.copy(alpha = 0.45f) else ArthTheme.colors.border
    val textColor = if (isDegraded) ArthTheme.colors.amber else ArthTheme.colors.textSecondary

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(6.dp))
            .background(containerColor)
            .border(1.dp, borderColor, RoundedCornerShape(6.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(
            text = notice ?: if (isDegraded) {
                "Limited connectivity detected. Check your network or Continue Offline."
            } else {
                "Sign-in service is temporarily unavailable."
            },
            style = MaterialTheme.typography.bodySmall,
            color = textColor,
            modifier = Modifier.weight(1f)
        )
        IconButton(
            onClick = onRetry,
            modifier = Modifier.size(28.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Refresh,
                contentDescription = "Retry connection check",
                tint = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.size(16.dp)
            )
        }
    }
}

@Composable
private fun AuthStatusAlert(
    errorMessage: String?,
    successMessage: String?,
    showBrowserFallback: Boolean,
    evergreenAccent: Color,
    evergreenSoft: Color,
    onBrowserFallback: () -> Unit,
    onDismiss: () -> Unit
) {
    if (errorMessage != null) {
        Spacer(Modifier.height(14.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(6.dp))
                .background(ArthTheme.colors.crimsonContainer)
                .border(1.dp, ArthTheme.colors.crimson.copy(alpha = 0.35f), RoundedCornerShape(6.dp))
                .padding(12.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Warning,
                        contentDescription = "Error",
                        tint = ArthTheme.colors.crimson,
                        modifier = Modifier
                            .size(18.dp)
                            .padding(top = 1.dp)
                    )
                    Text(
                        text = errorMessage,
                        color = ArthTheme.colors.crimson,
                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        text = "Dismiss",
                        style = MaterialTheme.typography.labelSmall,
                        color = ArthTheme.colors.textSecondary,
                        modifier = Modifier
                            .clickable { onDismiss() }
                            .padding(horizontal = 4.dp, vertical = 2.dp)
                    )
                }

                if (showBrowserFallback ||
                    errorMessage.contains("Google", ignoreCase = true)
                ) {
                    Surface(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .clickable { onBrowserFallback() },
                        shape = RoundedCornerShape(4.dp),
                        color = evergreenSoft
                    ) {
                        Text(
                            text = "Try browser Google sign-in →",
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                            color = evergreenAccent,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp)
                        )
                    }
                }
            }
        }
    }

    if (successMessage != null) {
        Spacer(Modifier.height(14.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(6.dp))
                .background(ArthTheme.colors.emeraldContainer)
                .border(1.dp, ArthTheme.colors.emerald.copy(alpha = 0.35f), RoundedCornerShape(6.dp))
                .padding(12.dp)
        ) {
            Row(
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.CheckCircle,
                    contentDescription = "Success",
                    tint = ArthTheme.colors.emerald,
                    modifier = Modifier.size(18.dp)
                )
                Text(
                    text = successMessage,
                    color = ArthTheme.colors.emerald,
                    style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}
