package com.digitaldodo.arth.feature.auth

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.digitaldodo.arth.core.designsystem.ArthButton
import com.digitaldodo.arth.core.designsystem.ArthOutlinedButton
import com.digitaldodo.arth.core.designsystem.ArthTheme

@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onLoginSuccess: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    val focusManager = LocalFocusManager.current
    val context = LocalContext.current
    val activity = context as? Activity
    val scrollState = rememberScrollState()

    LaunchedEffect(state.isAuthenticated) {
        if (state.isAuthenticated) {
            onLoginSuccess()
        }
    }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(horizontal = 24.dp, vertical = 32.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Brand Logo & Header
            Text(
                text = "SpendSense",
                style = MaterialTheme.typography.displayMedium.copy(
                    fontWeight = FontWeight.Bold,
                    letterSpacing = (-0.5).sp
                ),
                color = MaterialTheme.colorScheme.onBackground
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Personal Financial Ledger",
                style = MaterialTheme.typography.titleSmall,
                color = ArthTheme.colors.textSecondary
            )

            Spacer(Modifier.height(32.dp))

            when (state.authMode) {
                AuthMode.SIGN_IN -> {
                    // 1. Native Google Sign-In Button (Credential Manager)
                    ArthButton(
                        text = "Continue with Google",
                        onClick = {
                            if (activity != null) {
                                viewModel.signInWithNativeGoogle(activity, onLoginSuccess)
                            } else {
                                viewModel.startBrowserGoogleSignIn(context)
                            }
                        },
                        isLoading = state.isLoading,
                        modifier = Modifier.fillMaxWidth(),
                        backgroundColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary
                    )

                    Spacer(Modifier.height(20.dp))

                    // Divider
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        HorizontalDivider(
                            modifier = Modifier.weight(1f),
                            color = ArthTheme.colors.border
                        )
                        Text(
                            text = "  or sign in with password  ",
                            style = MaterialTheme.typography.labelSmall,
                            color = ArthTheme.colors.textMuted
                        )
                        HorizontalDivider(
                            modifier = Modifier.weight(1f),
                            color = ArthTheme.colors.border
                        )
                    }

                    Spacer(Modifier.height(20.dp))

                    // Username or Email
                    OutlinedTextField(
                        value = state.identifier,
                        onValueChange = { viewModel.onIdentifierChanged(it) },
                        label = { Text("Username or Email") },
                        placeholder = { Text("e.g. rahul_sharma or user@domain.com") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Email,
                            imeAction = ImeAction.Next
                        ),
                        keyboardActions = KeyboardActions(
                            onNext = { focusManager.moveFocus(FocusDirection.Down) }
                        )
                    )

                    Spacer(Modifier.height(14.dp))

                    // Password
                    OutlinedTextField(
                        value = state.password,
                        onValueChange = { viewModel.onPasswordChanged(it) },
                        label = { Text("Password") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        visualTransformation = if (state.isPasswordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = {
                            IconButton(onClick = { viewModel.togglePasswordVisibility() }) {
                                Icon(
                                    imageVector = if (state.isPasswordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                    contentDescription = if (state.isPasswordVisible) "Hide password" else "Show password",
                                    tint = ArthTheme.colors.textMuted
                                )
                            }
                        },
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = {
                                focusManager.clearFocus()
                                viewModel.login(onLoginSuccess)
                            }
                        )
                    )

                    // Forgot Password link
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp),
                        horizontalArrangement = Arrangement.End
                    ) {
                        Text(
                            text = "Forgot password?",
                            style = MaterialTheme.typography.labelSmall,
                            color = ArthTheme.colors.textSecondary,
                            modifier = Modifier
                                .clickable { viewModel.setAuthMode(AuthMode.FORGOT_PASSWORD) }
                                .padding(vertical = 4.dp)
                        )
                    }

                    // Messages
                    AuthStatusAlert(state.errorMessage, state.successMessage, onBrowserFallback = {
                        viewModel.startBrowserGoogleSignIn(context)
                    })

                    Spacer(Modifier.height(20.dp))

                    ArthOutlinedButton(
                        text = "Sign In",
                        onClick = {
                            focusManager.clearFocus()
                            viewModel.login(onLoginSuccess)
                        },
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(Modifier.height(16.dp))

                    // Sign up switch
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Don't have an account? ",
                            style = MaterialTheme.typography.bodySmall,
                            color = ArthTheme.colors.textSecondary
                        )
                        Text(
                            text = "Sign Up",
                            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier
                                .clickable { viewModel.setAuthMode(AuthMode.SIGN_UP) }
                                .padding(4.dp)
                        )
                    }
                }

                AuthMode.SIGN_UP -> {
                    Text(
                        text = "Create Account",
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Sign up with email to manage your finances",
                        style = MaterialTheme.typography.bodySmall,
                        color = ArthTheme.colors.textSecondary
                    )

                    Spacer(Modifier.height(24.dp))

                    OutlinedTextField(
                        value = state.email,
                        onValueChange = { viewModel.onEmailChanged(it) },
                        label = { Text("Email Address") },
                        placeholder = { Text("you@domain.com") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Email,
                            imeAction = ImeAction.Next
                        ),
                        keyboardActions = KeyboardActions(
                            onNext = { focusManager.moveFocus(FocusDirection.Down) }
                        )
                    )

                    Spacer(Modifier.height(14.dp))

                    OutlinedTextField(
                        value = state.username,
                        onValueChange = { viewModel.onUsernameChanged(it) },
                        label = { Text("Username (Optional)") },
                        placeholder = { Text("e.g. rahul_sharma") },
                        supportingText = { Text("3-20 characters: letters, numbers, underscores") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Text,
                            imeAction = ImeAction.Next
                        ),
                        keyboardActions = KeyboardActions(
                            onNext = { focusManager.moveFocus(FocusDirection.Down) }
                        )
                    )

                    Spacer(Modifier.height(14.dp))

                    OutlinedTextField(
                        value = state.password,
                        onValueChange = { viewModel.onPasswordChanged(it) },
                        label = { Text("Password") },
                        supportingText = { Text("Minimum 8 characters") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        visualTransformation = if (state.isPasswordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = {
                            IconButton(onClick = { viewModel.togglePasswordVisibility() }) {
                                Icon(
                                    imageVector = if (state.isPasswordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                    contentDescription = null,
                                    tint = ArthTheme.colors.textMuted
                                )
                            }
                        },
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Next
                        ),
                        keyboardActions = KeyboardActions(
                            onNext = { focusManager.moveFocus(FocusDirection.Down) }
                        )
                    )

                    Spacer(Modifier.height(14.dp))

                    OutlinedTextField(
                        value = state.confirmPassword,
                        onValueChange = { viewModel.onConfirmPasswordChanged(it) },
                        label = { Text("Confirm Password") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = {
                                focusManager.clearFocus()
                                viewModel.signUp(onLoginSuccess)
                            }
                        )
                    )

                    AuthStatusAlert(state.errorMessage, state.successMessage, onBrowserFallback = null)

                    Spacer(Modifier.height(20.dp))

                    ArthButton(
                        text = "Create Account",
                        onClick = {
                            focusManager.clearFocus()
                            viewModel.signUp(onLoginSuccess)
                        },
                        isLoading = state.isLoading,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(Modifier.height(16.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Already have an account? ",
                            style = MaterialTheme.typography.bodySmall,
                            color = ArthTheme.colors.textSecondary
                        )
                        Text(
                            text = "Sign In",
                            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier
                                .clickable { viewModel.setAuthMode(AuthMode.SIGN_IN) }
                                .padding(4.dp)
                        )
                    }
                }

                AuthMode.FORGOT_PASSWORD -> {
                    Text(
                        text = "Reset Password",
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Enter your registered email address or username to receive password reset instructions.",
                        style = MaterialTheme.typography.bodySmall,
                        color = ArthTheme.colors.textSecondary,
                        textAlign = TextAlign.Center
                    )

                    Spacer(Modifier.height(24.dp))

                    OutlinedTextField(
                        value = state.identifier,
                        onValueChange = { viewModel.onIdentifierChanged(it) },
                        label = { Text("Username or Email") },
                        placeholder = { Text("you@domain.com or username") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Email,
                            imeAction = ImeAction.Done
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = {
                                focusManager.clearFocus()
                                viewModel.forgotPassword()
                            }
                        )
                    )

                    AuthStatusAlert(state.errorMessage, state.successMessage, onBrowserFallback = null)

                    Spacer(Modifier.height(20.dp))

                    ArthButton(
                        text = "Send Reset Link",
                        onClick = {
                            focusManager.clearFocus()
                            viewModel.forgotPassword()
                        },
                        isLoading = state.isLoading,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(Modifier.height(16.dp))

                    Text(
                        text = "Back to Sign In",
                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .clickable { viewModel.setAuthMode(AuthMode.SIGN_IN) }
                            .padding(8.dp)
                    )
                }
            }

            Spacer(Modifier.height(24.dp))

            // Offline access option
            Text(
                text = "Continue Offline",
                style = MaterialTheme.typography.labelSmall,
                color = ArthTheme.colors.textMuted,
                modifier = Modifier
                    .clickable { viewModel.continueOffline(onLoginSuccess) }
                    .padding(8.dp)
            )
        }
    }
}

@Composable
private fun AuthStatusAlert(
    errorMessage: String?,
    successMessage: String?,
    onBrowserFallback: (() -> Unit)?
) {
    if (errorMessage != null) {
        Spacer(Modifier.height(14.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(ArthTheme.colors.crimsonContainer)
                .border(1.dp, ArthTheme.colors.crimson.copy(alpha = 0.3f), RoundedCornerShape(8.dp))
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
                        modifier = Modifier.size(18.dp)
                    )
                    Text(
                        text = errorMessage,
                        color = ArthTheme.colors.crimson,
                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
                        modifier = Modifier.weight(1f)
                    )
                }

                if (onBrowserFallback != null && (errorMessage.contains("Google") || errorMessage.contains("sign-in"))) {
                    Text(
                        text = "Trouble signing in? Open in browser →",
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                        color = ArthTheme.colors.crimson,
                        modifier = Modifier
                            .clickable { onBrowserFallback() }
                            .padding(top = 4.dp)
                    )
                }
            }
        }
    }

    if (successMessage != null) {
        Spacer(Modifier.height(14.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(ArthTheme.colors.emeraldContainer)
                .border(1.dp, ArthTheme.colors.emerald.copy(alpha = 0.3f), RoundedCornerShape(8.dp))
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
